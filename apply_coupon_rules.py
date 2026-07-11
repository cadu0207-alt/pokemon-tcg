import io

path = 'lojas.js'
with io.open(path, encoding='utf-8') as f:
    s = f.read()

# ── 1) Inserir bloco de funções de regra geral, logo depois de couponForTerm ──
anchor1 = "function couponForTerm(coupons, termId) {\n  return coupons.find(c => c.term_id === termId) || null;\n}\n"
assert s.count(anchor1) == 1, "anchor1 not found or not unique"

block1 = anchor1 + '''
// ── CUPONS POR REGRA GERAL ───────────────────────────────────────
// Em vez de vincular um cupom testado a um produto por vez, o admin
// cadastra a regra do cupom (código, %/R$, compra mínima, teto de
// desconto) UMA vez, e ela é aplicada automaticamente em qualquer
// produto rastreado cujo preço bata as condições.
async function loadCouponRules() {
  if (!sbClient) return [];
  const { data, error } = await sbClient
    .from('ml_coupon_rules')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });
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
'''
s = s.replace(anchor1, block1, 1)

# ── 2) renderProductCard: assinatura + lógica de desconto ──
old2 = "function renderProductCard(term, history, featured, coupon) {"
assert s.count(old2) == 1
s = s.replace(old2, "function renderProductCard(term, history, featured, coupon, rules) {", 1)

old3 = """  const updatedStr = latest && latest.found_at ? new Date(latest.found_at).toLocaleDateString('pt-BR') : '';
  const imgSrc = term.image_url || best.thumbnail;
  const discounted = coupon ? applyCouponDiscount(+best.price, coupon) : null;
  const priceHtml = discounted != null
    ? (
        '<div class="product-price product-price-with-coupon">' +
          '<span class="product-price-old">R$ ' + fmtBRLLoja(best.price) + '</span>' +
          '<span class="product-price-new">R$ ' + fmtBRLLoja(discounted) + '</span>' +
        '</div>' +
        '<div class="product-coupon-badge">🎟️ Cupom <code>' + coupon.code + '</code> · ' + (coupon.discount || '') + '</div>'
      )
    : '<div class="product-price">R$ ' + fmtBRLLoja(best.price) + '</div>';"""
assert s.count(old3) == 1
new3 = """  const updatedStr = latest && latest.found_at ? new Date(latest.found_at).toLocaleDateString('pt-BR') : '';
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

  const priceHtml = discounted != null
    ? (
        '<div class="product-price product-price-with-coupon">' +
          '<span class="product-price-old">R$ ' + fmtBRLLoja(best.price) + '</span>' +
          '<span class="product-price-new">R$ ' + fmtBRLLoja(discounted) + '</span>' +
        '</div>' +
        '<div class="product-coupon-badge">🎟️ Cupom <code>' + badgeCode + '</code> · ' + badgeLabel + '</div>'
      )
    : '<div class="product-price">R$ ' + fmtBRLLoja(best.price) + '</div>';"""
s = s.replace(old3, new3, 1)

# ── 3) renderShowcaseSection: carregar regras e passar pro card ──
old4 = """  const [histories, coupons] = await Promise.all([
    Promise.all(terms.map(t => loadPriceHistory(t.id))),
    loadCoupons()
  ]);
  const featuredCards = [];
  const normalCards = [];
  terms.forEach((t, i) => {
    const html = renderProductCard(t, histories[i], !!t.featured, couponForTerm(coupons, t.id));
    if (t.featured) featuredCards.push(html); else normalCards.push(html);
  });"""
assert s.count(old4) == 1
new4 = """  const [histories, coupons, rules] = await Promise.all([
    Promise.all(terms.map(t => loadPriceHistory(t.id))),
    loadCoupons(),
    loadCouponRules()
  ]);
  const featuredCards = [];
  const normalCards = [];
  terms.forEach((t, i) => {
    const html = renderProductCard(t, histories[i], !!t.featured, couponForTerm(coupons, t.id), rules);
    if (t.featured) featuredCards.push(html); else normalCards.push(html);
  });"""
s = s.replace(old4, new4, 1)

# ── 4) renderAdminPanel: carregar regras + seção de UI ──
old5 = "  const [terms, coupons] = await Promise.all([loadSearchTerms(), loadCoupons()]);"
assert s.count(old5) == 1
s = s.replace(old5, "  const [terms, coupons, rules] = await Promise.all([loadSearchTerms(), loadCoupons(), loadCouponRules()]);", 1)

old6 = """    : '<div class="ml-loading">Nenhum termo cadastrado ainda — adicione um acima.</div>';

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:28px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +"""
assert s.count(old6) == 1
new6 = """    : '<div class="ml-loading">Nenhum termo cadastrado ainda — adicione um acima.</div>';

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
    '<div class="sec-title" style="margin-top:28px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +"""
s = s.replace(old6, new6, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(s)

print("done, new length:", len(s.splitlines()))
