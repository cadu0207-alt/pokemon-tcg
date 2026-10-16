// ================================================================
// MyDeck — Loja Toybox · frete, compra e pedidos (mk_orders.js) — 17/10/2026
// - "Calcular frete" na página do produto (função mk-shop, ação quote — pública)
// - Compra pelo site (ação checkout): só aparece quando a loja liberou (mk_sellers.checkout_enabled)
// - "Meus pedidos" (comprador) e abas "Pedidos" e "Pagamentos" do painel do lojista
// Preço, frete e total são SEMPRE recalculados no servidor; aqui só mostramos.
// ================================================================

const MK_ORDER_LBL = {
  aguardando_pagamento: 'Aguardando pagamento', pago: 'Pago', em_separacao: 'Em separação', enviado: 'Enviado',
  entregue: 'Entregue', cancelado: 'Cancelado', expirado: 'Expirado',
};
const MK_PAY_LBL = {
  whatsapp: '💬 Combinar pelo WhatsApp', pix_manual: '🏦 Pix direto para a loja', pix: '⚡ Pix (QR Code)',
  card: '💳 Cartão de crédito', boleto: '🧾 Boleto',
};
const MK_PAY_HINT = {
  whatsapp: 'A loja responde e combina o pagamento com você.', pix_manual: 'Você paga na chave Pix da loja e a loja confirma.',
  pix: 'Aprovação automática em segundos.', card: 'Em até 12x, pelo Mercado Pago.', boleto: 'Compensa em 1–3 dias úteis.',
};

let mkCk = null;        // estado do checkout aberto
let mkOrders = null;    // pedidos carregados (comprador ou lojista)

function mkLsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function mkLsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ok */ } }
function mkFmtCep(v) { const d = mkDigits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }

async function mkShopCall(body) {
  let token = SUPABASE_KEY;
  try { const s = await sbClient.auth.getSession(); if (s && s.data && s.data.session) token = s.data.session.access_token; } catch (e) { /* anônimo */ }
  let resp;
  try {
    resp = await fetch(SUPABASE_URL + '/functions/v1/mk-shop', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ seller: MK_SLUG }, body)),
    });
  } catch (e) { return { ok: false, error: 'Sem conexão. Tente de novo.' }; }
  let j = null;
  try { j = await resp.json(); } catch (e) { /* corpo vazio */ }
  return j || { ok: false, error: 'Resposta inesperada do servidor.' };
}

function mkShipLabel(o) {
  return o.service + ' — ' + (o.price > 0 ? mkMoney(o.price) : 'grátis') + (o.dias != null ? ' · ' + o.dias + ' dia' + (o.dias === 1 ? '' : 's') + ' úteis' : '');
}

// ══════════════════ frete na página do produto ══════════════════
function mkShipBoxHtml(p) {
  if (mkQty(p) <= 0 || p.status !== 'ativo') return '';
  return '<div class="mk-ship" id="mk-ship-' + p.id + '">' +
    '<div class="mk-ship-t">🚚 Calcular frete</div>' +
    '<div class="mk-ship-row"><input id="mk-ship-cep" inputmode="numeric" maxlength="9" placeholder="Seu CEP" value="' + mkEsc(mkFmtCep(mkLsGet('mk_cep'))) + '" ' +
      'oninput="this.value=mkFmtCep(this.value)" onkeydown="if(event.key===\'Enter\')mkQuoteShip(' + p.id + ')">' +
      '<button type="button" class="btn-mini" onclick="mkQuoteShip(' + p.id + ')">Calcular</button></div>' +
    '<div id="mk-ship-out" class="mk-ship-out"></div></div>';
}
async function mkQuoteShip(pid) {
  const out = document.getElementById('mk-ship-out');
  const cep = mkDigits((document.getElementById('mk-ship-cep') || {}).value);
  if (!out) return;
  if (cep.length !== 8) { out.innerHTML = '<span class="mk-ship-err">Digite o CEP com 8 números.</span>'; return; }
  mkLsSet('mk_cep', cep);
  out.textContent = 'Calculando…';
  const r = await mkShopCall({ action: 'quote', items: [{ product_id: pid, qty: 1 }], destination_cep: cep });
  if (!document.getElementById('mk-ship-out')) return;
  if (!r.ok) { out.innerHTML = '<span class="mk-ship-err">' + mkEsc(r.error || 'Não consegui calcular.') + '</span>'; return; }
  if (!r.options.length) {
    out.innerHTML = '<span class="mk-ship-err">' + mkEsc(typeof mkShipEmptyMessage === 'function' ? mkShipEmptyMessage(r) : 'A loja ainda não tem frete automático configurado. Combine o envio pelo WhatsApp.') + '</span>'; return;
  }
  out.innerHTML = '<ul class="mk-ship-list">' + r.options.map(function (o) { return '<li>' + mkEsc(mkShipLabel(o)) + '</li>'; }).join('') + '</ul>' +
    '<div class="mk-prod-hint">Para 1 unidade. Postagem em até ' + mkEsc(r.handling_days) + ' dias úteis após o pagamento.</div>';
}
window.mkQuoteShip = mkQuoteShip; window.mkFmtCep = mkFmtCep;

// botão de compra mostrado na página do produto (quando a loja liberou o checkout)
function mkBuyBtnHtml(p) {
  const s = mk.seller;
  if (!s || !s.checkout_enabled || mkQty(p) <= 0 || p.status !== 'ativo' || mk.isMember) return '';
  return '<button type="button" class="mk-buy-btn mk-buy-site" onclick="mkOpenCheckout(' + p.id + ')">🛒 Comprar pelo site</button>';
}
window.mkBuyBtnHtml = mkBuyBtnHtml; window.mkShipBoxHtml = mkShipBoxHtml;

// ══════════════════ checkout ══════════════════
// 17/10/2026: o checkout agora trabalha com uma LISTA de itens (antes, um produto só). "Comprar pelo site" na página do
// produto abre com 1 item; "Finalizar compra" no carrinho abre com o carrinho inteiro (o servidor e o banco já aceitavam
// até 20 itens por pedido).
function mkOpenCheckout(pid) {
  const p = mk.products.find(function (x) { return x.id === pid; });
  if (!p) return;
  mkStartCheckout([{ p: p, qty: 1 }], false);
}
function mkOpenCartCheckout() {
  const r = typeof mkCartResolve === 'function' ? mkCartResolve() : { lines: [] };
  if (!r.lines.length) { mkToast('Seu carrinho está vazio.', true); return; }
  mkStartCheckout(r.lines.map(function (l) { return { p: l.p, qty: l.qty }; }), true);
}
function mkCartCheckoutBtnHtml() {   // botão "Finalizar compra" dentro do carrinho (só com o checkout liberado)
  const s = mk.seller;
  if (!s || !s.checkout_enabled || mk.isMember) return '';
  return '<button type="button" class="mk-buy-btn mk-buy-site" style="border:0;cursor:pointer;font-family:inherit" onclick="mkOpenCartCheckout()">🛒 Finalizar compra pelo site</button>';
}
window.mkOpenCartCheckout = mkOpenCartCheckout; window.mkCartCheckoutBtnHtml = mkCartCheckoutBtnHtml;

function mkStartCheckout(lines, fromCart) {
  if (!(typeof uid === 'function' && uid())) {
    mkCloseModal();   // o carrinho fica guardado no navegador: volta depois do login
    if (typeof _showAuth === 'function') _showAuth(true); else mkToast('Faça login para comprar.', true);
    return;
  }
  const s = mk.seller;
  const methods = (s.pay_methods || []).filter(function (m) { return MK_PAY_LBL[m]; });
  mkCk = {
    lines: lines, fromCart: !!fromCart, delivery: 'envio', options: null, shipOpt: null, method: methods[0] || null, methods: methods, busy: false,
    name: mkLsGet('mk_name'), whatsapp: mkLsGet('mk_wa'), email: '', cep: mkLsGet('mk_cep'),
    street: '', number: '', complement: '', district: '', city: '', uf: '', note: '',
  };
  mkRenderCheckout();
}
window.mkOpenCheckout = mkOpenCheckout;

function mkCkVal(id) { const e = document.getElementById(id); return e ? e.value : ''; }
function mkCkReadForm() {
  const c = mkCk; if (!c) return;
  ['name', 'whatsapp', 'email', 'cep', 'street', 'number', 'complement', 'district', 'city', 'uf', 'note'].forEach(function (k) {
    const e = document.getElementById('mkck-' + k); if (e) c[k] = e.value;
  });
  (c.lines || []).forEach(function (l) {
    const q = document.getElementById('mkck-qty-' + l.p.id);
    if (q) l.qty = Math.max(1, Math.min(parseInt(q.value, 10) || 1, mkQty(l.p)));
  });
}

function mkRenderCheckout() {
  const c = mkCk; if (!c) return;
  const s = mk.seller;
  const pickup = !!s.pickup_enabled;
  const sub = Math.round(c.lines.reduce(function (t, l) { return t + Number(l.p.price) * l.qty; }, 0) * 100) / 100;
  const ship = c.delivery === 'retirada' ? 0 : (c.shipOpt ? c.shipOpt.price : null);
  const f = function (id, label, val, extra) {
    return '<label class="mk-f"><span>' + label + '</span><input id="mkck-' + id + '" value="' + mkEsc(val) + '" ' + (extra || '') + '></label>';
  };
  let html = '<h3 class="mk-form-title">Finalizar compra</h3><div class="mk-form">' +
    c.lines.map(function (l) {
      const maxQ = Math.min(mkQty(l.p), 20);
      return '<div class="mk-ck-item"><b>' + mkEsc(l.p.title) + '</b><span>' + mkMoney(l.p.price) + ' × ' +
        '<input id="mkck-qty-' + l.p.id + '" type="number" min="1" max="' + maxQ + '" value="' + l.qty + '" onchange="mkCkQty()" style="width:58px"></span></div>';
    }).join('') +
    '<h4 class="mk-sub">Seus dados</h4>' +
    '<div class="mk-f-row">' + f('name', 'Nome completo *', c.name, 'autocomplete="name"') + f('whatsapp', 'WhatsApp (com DDD)', c.whatsapp, 'inputmode="tel" autocomplete="tel"') + '</div>' +
    f('email', 'E-mail' + (c.method === 'pix' || c.method === 'card' || c.method === 'boleto' ? ' *' : ''), c.email, 'type="email" autocomplete="email"');
  if (pickup) {
    html += '<div class="mk-seg"><button type="button" class="filter-chip' + (c.delivery === 'envio' ? ' filter-chip-active' : '') + '" onclick="mkCkDelivery(\'envio\')">🚚 Receber em casa</button>' +
      '<button type="button" class="filter-chip' + (c.delivery === 'retirada' ? ' filter-chip-active' : '') + '" onclick="mkCkDelivery(\'retirada\')">🤝 Retirar com a loja</button></div>';
  }
  if (c.delivery === 'retirada') {
    html += '<div class="mk-note">Retirada: ' + mkEsc(s.pickup_note || 'a loja combina local e horário com você.') + '</div>';
  } else {
    html += '<h4 class="mk-sub">Entrega</h4>' +
      '<div class="mk-f-row">' + f('cep', 'CEP *', mkFmtCep(c.cep), 'inputmode="numeric" maxlength="9" oninput="this.value=mkFmtCep(this.value)" onblur="mkCkCep()"') + f('number', 'Número *', c.number) + '</div>' +
      f('street', 'Rua *', c.street) +
      '<div class="mk-f-row">' + f('complement', 'Complemento', c.complement) + f('district', 'Bairro', c.district) + '</div>' +
      '<div class="mk-f-row">' + f('city', 'Cidade *', c.city) + f('uf', 'UF *', c.uf, 'maxlength="2" style="text-transform:uppercase"') + '</div>' +
      '<div class="mk-form-actions"><button type="button" class="btn-mini" onclick="mkCkQuote()">🚚 Calcular frete</button></div>';
    if (c.options) {
      html += c.options.length
        ? '<div class="mk-opts">' + c.options.filter(function (o) { return o.kind !== 'retirada'; }).map(function (o) {
            return '<label class="mk-opt"><input type="radio" name="mkck-ship" ' + (c.shipOpt && c.shipOpt.id === o.id ? 'checked' : '') + ' onchange="mkCkPickShip(\'' + mkEsc(o.id).replace(/'/g, '') + '\')"> ' + mkEsc(mkShipLabel(o)) + '</label>';
          }).join('') + '</div>'
        : '<div class="mk-note mk-note-warn">Sem frete automático para esse CEP. Fale com a loja pelo WhatsApp.</div>';
    }
  }
  html += '<h4 class="mk-sub">Pagamento</h4>';
  if (!c.methods.length) html += '<div class="mk-note mk-note-warn">A loja ainda não ativou formas de pagamento.</div>';
  else html += '<div class="mk-opts">' + c.methods.map(function (m) {
    return '<label class="mk-opt"><input type="radio" name="mkck-pay" ' + (c.method === m ? 'checked' : '') + ' onchange="mkCkMethod(\'' + m + '\')"> ' +
      mkEsc(MK_PAY_LBL[m]) + '<small>' + mkEsc(MK_PAY_HINT[m] || '') + '</small></label>';
  }).join('') + '</div>';
  html += '<label class="mk-f"><span>Observação (opcional)</span><textarea id="mkck-note" rows="2" maxlength="500">' + mkEsc(c.note) + '</textarea></label>' +
    '<div class="mk-ck-total"><div>Produtos <b>' + mkMoney(sub) + '</b></div><div>Frete <b>' + (ship == null ? 'calcule acima' : ship > 0 ? mkMoney(ship) : 'grátis') + '</b></div>' +
      '<div class="mk-ck-sum">Total <b>' + (ship == null ? '—' : mkMoney(sub + ship)) + '</b></div></div>' +
    '<div id="mkck-err" class="mk-form-err"></div>' +
    '<div class="mk-form-actions"><button type="button" class="btn-mini mk-primary" id="mkck-go" onclick="mkCkSubmit()"' + (c.busy ? ' disabled' : '') + '>' + (c.busy ? 'Enviando…' : 'Fazer pedido') + '</button>' +
      '<button type="button" class="btn-mini" onclick="mkCloseModal()">Cancelar</button></div>' +
    '<div class="mk-prod-hint">Ao fazer o pedido os produtos ficam reservados para você. Preço e frete são conferidos pelo servidor.</div></div>';
  mkOpenModal(html, { wide: true, sticky: true });
}

function mkCkQty() { mkCkReadForm(); mkCk.options = null; mkCk.shipOpt = null; mkRenderCheckout(); }
function mkCkDelivery(d) { mkCkReadForm(); mkCk.delivery = d; mkRenderCheckout(); }
function mkCkMethod(m) { mkCkReadForm(); mkCk.method = m; mkRenderCheckout(); }
function mkCkPickShip(id) { mkCkReadForm(); mkCk.shipOpt = (mkCk.options || []).find(function (o) { return o.id === id; }) || null; mkRenderCheckout(); }
function mkCkErr(m) { const e = document.getElementById('mkck-err'); if (e) e.textContent = m || ''; }

async function mkCkCep() {   // preenche rua/bairro/cidade pelo ViaCEP (só ajuda; o usuário pode editar)
  mkCkReadForm();
  const cep = mkDigits(mkCk.cep);
  if (cep.length !== 8 || mkCk.street) return;
  try {
    const r = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
    const j = await r.json();
    if (!j || j.erro || !mkCk) return;
    mkCkReadForm();
    mkCk.street = j.logradouro || mkCk.street; mkCk.district = j.bairro || mkCk.district; mkCk.city = j.localidade || mkCk.city; mkCk.uf = j.uf || mkCk.uf;
    mkRenderCheckout();
  } catch (e) { /* digita à mão */ }
}
async function mkCkQuote() {
  mkCkReadForm();
  const cep = mkDigits(mkCk.cep);
  if (cep.length !== 8) { mkCkErr('Digite o CEP com 8 números.'); return; }
  mkCkErr('Calculando frete…');
  const r = await mkShopCall({ action: 'quote', items: mkCk.lines.map(function (l) { return { product_id: l.p.id, qty: l.qty }; }), destination_cep: cep });
  if (!mkCk) return;
  if (!r.ok) { mkCkErr(r.error || 'Não consegui calcular o frete.'); return; }
  if (!r.options || !r.options.length) { mkCkErr(typeof mkShipEmptyMessage === 'function' ? mkShipEmptyMessage(r) : 'Sem frete automático para esse CEP.'); }
  mkLsSet('mk_cep', cep);
  mkCk.options = r.options; mkCk.shipOpt = r.options.filter(function (o) { return o.kind !== 'retirada'; })[0] || null;
  mkRenderCheckout();
}

async function mkCkSubmit() {
  const c = mkCk; if (!c || c.busy) return;
  mkCkReadForm();
  if (c.name.trim().length < 3) { mkCkErr('Informe seu nome completo.'); return; }
  if (!c.method) { mkCkErr('Escolha a forma de pagamento.'); return; }
  if (c.delivery === 'envio' && !c.shipOpt) { mkCkErr('Calcule o frete e escolha uma opção.'); return; }
  c.busy = true; mkRenderCheckout(); mkCkErr('');
  const body = {
    action: 'checkout', items: c.lines.map(function (l) { return { product_id: l.p.id, qty: l.qty }; }), delivery: c.delivery, payment_method: c.method,
    name: c.name.trim(), whatsapp: c.whatsapp, email: c.email.trim(), note: c.note,
  };
  if (c.delivery === 'envio') {
    body.shipping_option = c.shipOpt.id;
    body.address = { cep: mkDigits(c.cep), street: c.street, number: c.number, complement: c.complement, district: c.district, city: c.city, uf: c.uf };
  }
  const r = await mkShopCall(body);
  c.busy = false;
  if (!r.ok) { mkRenderCheckout(); mkCkErr(r.error || 'Não consegui criar o pedido.'); return; }
  mkLsSet('mk_name', c.name.trim()); mkLsSet('mk_wa', c.whatsapp);
  if (c.fromCart && typeof mkCartLoad === 'function') {   // o que virou pedido sai do carrinho
    const bought = c.lines.map(function (l) { return l.p.id; });
    const st = mkCartLoad(); st.items = st.items.filter(function (i) { return bought.indexOf(i.id) < 0; });
    mkCartSave(); if (typeof mkCartRefreshUI === 'function') mkCartRefreshUI();
  }
  mkCk = null;
  mkLoadAll(true).then(function () { if (document.getElementById('mk-grid-holder')) mkRenderGridOnly(); });
  mkShowPayment(r.order, r.payment, false);
}
window.mkCkQty = mkCkQty; window.mkCkDelivery = mkCkDelivery; window.mkCkMethod = mkCkMethod; window.mkCkPickShip = mkCkPickShip;
window.mkCkCep = mkCkCep; window.mkCkQuote = mkCkQuote; window.mkCkSubmit = mkCkSubmit;

// ── tela de pagamento (depois de criar o pedido, ou reaberta em "Meus pedidos") ──
function mkCopyText(id) {
  const e = document.getElementById(id); if (!e) return;
  const txt = e.value || e.textContent || '';
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { mkToast('Copiado!'); }, function () { e.select && e.select(); });
  else if (e.select) { e.select(); try { document.execCommand('copy'); mkToast('Copiado!'); } catch (x) { /* ok */ } }
}
window.mkCopyText = mkCopyText;

function mkShowPayment(order, pay, fromList) {
  const exp = order.expires_at ? new Date(order.expires_at) : null;
  let html = '<h3 class="mk-form-title">' + (fromList ? 'Pedido #' + mkEsc(order.id) : 'Pedido #' + mkEsc(order.id) + ' criado ✅') + '</h3><div class="mk-form">' +
    '<div class="mk-ck-sum">Total a pagar <b>' + mkMoney(order.total) + '</b></div>';
  if (pay.method === 'pix' && pay.pix_copy_paste) {
    html += (pay.pix_qr_base64 ? '<img class="mk-qr" alt="QR Code Pix" src="data:image/png;base64,' + mkEsc(pay.pix_qr_base64) + '">' : '') +
      '<label class="mk-f"><span>Pix copia e cola</span><input id="mk-pix-cc" readonly value="' + mkEsc(pay.pix_copy_paste) + '" onfocus="this.select()"></label>' +
      '<button type="button" class="btn-mini mk-primary" onclick="mkCopyText(\'mk-pix-cc\')">📋 Copiar código</button>' +
      '<div class="mk-prod-hint">Pague no app do seu banco. Assim que o Pix for aprovado o pedido é confirmado sozinho' + (exp ? ' (vale até ' + exp.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ')' : '') + '.</div>';
  } else if (pay.checkout_url) {
    html += '<a class="mk-buy-btn mk-buy-site" target="_blank" rel="noopener" href="' + mkEsc(mkSafeUrl(pay.checkout_url) || '#') + '">Ir para o pagamento seguro</a>' +
      '<div class="mk-prod-hint">Você paga no ambiente do Mercado Pago. Voltando aqui, o pedido atualiza quando o pagamento for aprovado.</div>';
  } else if (pay.method === 'pix_manual') {
    html += '<label class="mk-f"><span>Chave Pix da loja' + (pay.pix_holder ? ' — ' + mkEsc(pay.pix_holder) : '') + '</span><input id="mk-pix-key" readonly value="' + mkEsc(pay.pix_key || '') + '" onfocus="this.select()"></label>' +
      '<button type="button" class="btn-mini mk-primary" onclick="mkCopyText(\'mk-pix-key\')">📋 Copiar chave</button>' +
      '<div class="mk-prod-hint">Pague exatamente ' + mkEsc(mkMoney(order.total)) + ' e mande o comprovante pelo WhatsApp. A loja confirma e prepara o envio.</div>' +
      (pay.whatsapp_url ? '<a class="mk-buy-btn" target="_blank" rel="noopener" href="' + mkEsc(pay.whatsapp_url) + '">💬 Enviar comprovante</a>' : '');
  } else if (pay.whatsapp_url) {
    html += '<a class="mk-buy-btn" target="_blank" rel="noopener" href="' + mkEsc(pay.whatsapp_url) + '">💬 Falar com a loja sobre o pedido</a>' +
      '<div class="mk-prod-hint">A loja combina o pagamento com você pelo WhatsApp. O produto fica reservado até ' + (exp ? exp.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'a loja confirmar') + '.</div>';
  }
  html += '<div class="mk-form-actions"><button type="button" class="btn-mini" onclick="mkCloseModal();mkOpenMyOrders()">📦 Meus pedidos</button>' +
    '<button type="button" class="btn-mini" onclick="mkCloseModal()">Fechar</button></div></div>';
  mkOpenModal(html, { wide: false });
}

// ══════════════════ Meus pedidos (comprador) ══════════════════
const MK_ORDER_SELECT = '*, items:mk_order_items(id,title,image_url,unit_price,qty), payments:mk_payments(id,provider,method,status,checkout_url,pix_copy_paste,pix_qr_base64,expires_at,created_at)';

async function mkOpenMyOrders() {
  if (!(typeof uid === 'function' && uid())) { if (typeof _showAuth === 'function') _showAuth(true); else mkToast('Faça login para ver seus pedidos.', true); return; }
  mkOpenModal('<h3 class="mk-form-title">Meus pedidos</h3><div id="mk-my-orders" class="mk-empty">Carregando…</div>', { wide: true });
  const { data, error } = await sbClient.from('mk_orders').select(MK_ORDER_SELECT).eq('buyer_id', uid()).order('created_at', { ascending: false }).limit(50);
  const box = document.getElementById('mk-my-orders'); if (!box) return;
  if (error) { box.textContent = 'Não consegui carregar seus pedidos.'; return; }
  mkOrders = data || [];
  box.className = '';
  box.innerHTML = mkOrders.length ? mkOrders.map(function (o) { return mkOrderCardHtml(o, false); }).join('') : '<div class="mk-empty">Você ainda não fez pedidos na loja.</div>';
}
window.mkOpenMyOrders = mkOpenMyOrders;

function mkOrderCardHtml(o, seller) {
  const items = (o.items || []).map(function (i) { return mkEsc(i.qty + '× ' + i.title); }).join('<br>');
  const when = new Date(o.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const pend = (o.payments || []).slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0];
  let extra = '';
  if (o.tracking_code) extra += '<div class="mk-ord-line">📮 Rastreio: <b>' + mkEsc(o.tracking_code) + '</b>' + (o.carrier ? ' (' + mkEsc(o.carrier) + ')' : '') + '</div>';
  if (o.status === 'aguardando_pagamento' && o.expires_at) extra += '<div class="mk-ord-line">⏳ Reservado até ' + new Date(o.expires_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '</div>';
  if (seller) {
    const a = o.shipping_snapshot;
    extra += '<div class="mk-ord-line">👤 ' + mkEsc(o.buyer_name) + (o.buyer_whatsapp ? ' · <a target="_blank" rel="noopener" href="https://wa.me/' + (o.buyer_whatsapp.length <= 11 ? '55' : '') + mkEsc(o.buyer_whatsapp) + '">WhatsApp</a>' : '') + (o.buyer_email ? ' · ' + mkEsc(o.buyer_email) : '') + '</div>';
    if (o.delivery_type === 'retirada') extra += '<div class="mk-ord-line">🤝 Retirada em mãos</div>';
    else if (a) extra += '<div class="mk-ord-line">📍 ' + mkEsc([a.street + ', ' + a.number, a.complement, a.district, a.city + '/' + a.uf, 'CEP ' + mkFmtCep(a.cep)].filter(Boolean).join(' — ')) + ' · ' + mkEsc(o.delivery_service || '') + '</div>';
    if (o.buyer_note) extra += '<div class="mk-ord-line">📝 ' + mkEsc(o.buyer_note) + '</div>';
    extra += '<div class="mk-ord-line">💳 ' + mkEsc(MK_PAY_LBL[o.payment_method] || o.payment_method) + ' · comissão MyDeck ' + mkMoney(o.fee_amount) + '</div>';
  }
  let actions = '';
  if (seller) {
    if (o.status === 'aguardando_pagamento') actions += '<button class="btn-mini mk-primary" onclick="mkOrderAct(' + o.id + ',\'confirmar_pagamento\')">✅ Confirmar pagamento</button>';
    if (o.status === 'pago') actions += '<button class="btn-mini" onclick="mkOrderAct(' + o.id + ',\'separar\')">📦 Separar</button>';
    if (o.status === 'pago' || o.status === 'em_separacao') actions += '<button class="btn-mini mk-primary" onclick="mkOrderAct(' + o.id + ',\'enviar\')">🚚 ' + (o.delivery_type === 'retirada' ? 'Pronto p/ retirar' : 'Marcar enviado') + '</button>';
    if (o.status === 'enviado') actions += '<button class="btn-mini mk-primary" onclick="mkOrderAct(' + o.id + ',\'entregar\')">🎉 Marcar entregue</button>';
    if (['aguardando_pagamento', 'pago', 'em_separacao'].indexOf(o.status) >= 0) actions += '<button class="btn-mini" onclick="mkOrderAct(' + o.id + ',\'cancelar\')">✖ Cancelar</button>';
  } else if (o.status === 'aguardando_pagamento') {
    if (pend && (pend.checkout_url || pend.pix_copy_paste)) actions += '<button class="btn-mini mk-primary" onclick="mkReopenPayment(' + o.id + ')">💳 Pagar</button>';
    actions += '<button class="btn-mini" onclick="mkCancelMine(' + o.id + ')">✖ Cancelar pedido</button>';
  }
  return '<div class="mk-ord"><div class="mk-ord-head"><b>Pedido #' + o.id + '</b><span class="mk-ord-st mk-ord-' + mkEsc(o.status) + '">' + mkEsc(MK_ORDER_LBL[o.status] || o.status) + '</span>' +
    '<span class="mk-ord-when">' + when + '</span></div><div class="mk-ord-items">' + items + '</div>' + extra +
    '<div class="mk-ord-foot"><span>Total <b>' + mkMoney(o.total) + '</b> (frete ' + (o.shipping_cost > 0 ? mkMoney(o.shipping_cost) : 'grátis') + ')</span><span class="mk-row-actions-inline">' + actions + '</span></div></div>';
}

function mkReopenPayment(id) {
  const o = (mkOrders || []).find(function (x) { return x.id === id; }); if (!o) return;
  const pay = (o.payments || []).slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })[0]; if (!pay) return;
  mkShowPayment(o, { method: pay.method, checkout_url: pay.checkout_url, pix_copy_paste: pay.pix_copy_paste, pix_qr_base64: pay.pix_qr_base64 }, true);
}
async function mkCancelMine(id) {
  if (!confirm('Cancelar o pedido #' + id + '? O produto volta para a vitrine.')) return;
  const { error } = await sbClient.rpc('mk_cancel_my_order', { p_order: id });
  if (error) { mkToast(error.message, true); return; }
  mkToast('Pedido cancelado.');
  mkLoadAll(true).then(function () { if (document.getElementById('mk-grid-holder')) mkRenderGridOnly(); });
  mkOpenMyOrders();
}
window.mkReopenPayment = mkReopenPayment; window.mkCancelMine = mkCancelMine;

// ══════════════════ painel do lojista: Pedidos ══════════════════
// ── interesses via WhatsApp (17/10/2026): valem 2 h, não mexem no estoque; "vendido" baixa o estoque ──
let mkInterests = [];
function mkInterestCardHtml(i) {
  const open = i.status === 'aberto';
  const exp = new Date(i.expires_at).getTime();
  const left = exp - Date.now();
  const expired = open && left <= 0;
  const when = new Date(i.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const items = (i.items || []).map(function (x) { return mkEsc(x.qty + '× ' + x.title); }).join('<br>');
  let tag, tagCls;
  if (i.status === 'vendido') { tag = 'Vendido'; tagCls = 'mk-ord-pago'; }
  else if (i.status === 'cancelado') { tag = 'Descartado'; tagCls = 'mk-ord-cancelado'; }
  else if (expired) { tag = 'Expirou'; tagCls = 'mk-ord-expirado'; }
  else { const m = Math.max(1, Math.round(left / 60000)); tag = 'Interessado · ' + (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'min' : '') : m + ' min'); tagCls = 'mk-ord-aguardando_pagamento'; }
  const actions = open
    ? '<button class="btn-mini mk-primary" onclick="mkInterestAct(' + i.id + ',\'vender\')">✅ Marcar como vendido</button>' +
      '<button class="btn-mini" onclick="mkInterestAct(' + i.id + ',\'descartar\')">✖ Descartar</button>'
    : '';
  return '<div class="mk-ord"><div class="mk-ord-head"><b>💬 ' + mkEsc(i.buyer_name) + '</b><span class="mk-ord-st ' + tagCls + '">' + tag + '</span>' +
    '<span class="mk-ord-when">' + when + '</span></div><div class="mk-ord-items">' + items + '</div>' +
    (i.buyer_email ? '<div class="mk-ord-line">✉️ ' + mkEsc(i.buyer_email) + '</div>' : '') +
    '<div class="mk-ord-foot"><span>Total <b>' + mkMoney(i.total) + '</b> (sem frete)</span><span class="mk-row-actions-inline">' + actions + '</span></div></div>';
}
function mkInterestsHtml() {
  const open = mkInterests.filter(function (i) { return i.status === 'aberto'; });
  const closed = mkInterests.filter(function (i) { return i.status !== 'aberto'; }).slice(0, 15);
  if (!mkInterests.length) return '';
  return '<h4 class="mk-sub">💬 Interesses pelo WhatsApp (' + open.length + ')</h4>' +
    '<div class="mk-prod-hint" style="margin:0 0 8px">Cliente que clicou em “Chamar a loja no WhatsApp”. Vale 2 horas e <b>não tira nada do estoque</b>. Fechou a venda na conversa? Toque em <b>Marcar como vendido</b> — só aí o estoque baixa.</div>' +
    (open.length ? open.map(mkInterestCardHtml).join('') : '<div class="mk-empty">Nenhum interesse em aberto.</div>') +
    (closed.length ? '<details class="mk-info"><summary>Interesses encerrados (' + closed.length + ')</summary>' + closed.map(mkInterestCardHtml).join('') + '</details>' : '');
}
async function mkInterestAct(id, action) {
  const i = mkInterests.find(function (x) { return x.id === id; }); if (!i) return;
  if (action === 'vender') {
    const resumo = (i.items || []).map(function (x) { return x.qty + '× ' + x.title; }).join('\n');
    if (!confirm('Confirmar a venda para ' + i.buyer_name + '?\n\n' + resumo + '\n\nIsso baixa do estoque.')) return;
  } else if (!confirm('Descartar este interesse? O estoque não muda.')) return;
  const r = action === 'vender' ? await sbClient.rpc('mk_interest_sell', { p_interest: id }) : await sbClient.rpc('mk_interest_cancel', { p_interest: id });
  if (r.error) { mkToast(r.error.message, true); return; }
  mkToast(action === 'vender' ? 'Venda registrada e estoque atualizado.' : 'Interesse descartado.');
  await mkLoadSellerOrders();
  if (action === 'vender') mkLoadAll(true);
}
window.mkInterestAct = mkInterestAct;

async function mkLoadSellerOrders() {
  const ir = await sbClient.from('mk_interests').select('id,buyer_name,buyer_email,items,total,status,expires_at,created_at').eq('seller_id', mk.seller.id).order('created_at', { ascending: false }).limit(60);
  mkInterests = ir.error ? [] : (ir.data || []);
  const { data, error } = await sbClient.from('mk_orders').select(MK_ORDER_SELECT).eq('seller_id', mk.seller.id).order('created_at', { ascending: false }).limit(100);
  const body = document.getElementById('mk-panel-body'); if (!body || mk.panelTab !== 'pedidos') return;
  if (error) { body.innerHTML = '<div class="mk-empty">Não consegui carregar os pedidos.</div>'; return; }
  mkOrders = data || [];
  mkRenderSellerOrders();
  // o estado do push é descoberto de forma assíncrona: atualiza o aviso quando souber
  if (typeof notifPushRefreshState === 'function') notifPushRefreshState().then(mkAlertRefresh, function () {});
}
// 17/10/2026: quem é da equipe recebe aviso de pedido novo/pago no sino, por e-mail e por push no celular. O push só funciona
// depois que a pessoa ativa NESTE aparelho (o navegador exige o clique) — o aviso abaixo mostra o estado e traz o botão.
function mkAlertBannerHtml() {
  const st = typeof notifPushState === 'string' ? notifPushState : 'unknown';
  let txt, btn = '', cls = 'mk-note';
  if (st === 'on') {
    txt = '🔔 <b>Alertas de pedido ligados neste aparelho.</b> Você também recebe por e-mail.';
    cls += ' mk-note-ok';
  } else if (st === 'ios-install') {
    txt = '📲 <b>No iPhone:</b> adicione o MyDeck à Tela de Início (Compartilhar → Adicionar à Tela de Início), abra por lá e volte aqui para ativar o alerta de pedido no celular. Por e-mail você já recebe.';
    cls += ' mk-note-warn';
  } else if (st === 'blocked') {
    txt = '🔕 As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ser avisado de pedido no celular. Por e-mail você já recebe.';
    cls += ' mk-note-warn';
  } else if (st === 'unsupported') {
    txt = '🔔 Este navegador não recebe notificação no celular. Você recebe os pedidos por e-mail e no sino do MyDeck.';
  } else {
    txt = '🔔 <b>Ative o alerta no celular</b> para ser avisado na hora quando entrar um pedido (mesmo com o app fechado). Por e-mail você já recebe.';
    btn = '<button type="button" class="mk-buy-btn mk-buy-site" style="border:0;cursor:pointer;font-family:inherit;width:auto;padding:8px 16px" id="mk-alert-btn" onclick="mkAlertEnable()">Ativar neste aparelho</button>';
    cls += ' mk-note-warn';
  }
  return '<div id="mk-alert-banner" class="' + cls + '" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>' + txt + '</span>' + btn + '</div>';
}
async function mkAlertEnable() {
  if (typeof notifPushEnable !== 'function') return;
  const b = document.getElementById('mk-alert-btn'); if (b) b.disabled = true;
  try { await notifPushEnable(); } catch (e) { /* notifPushEnable já avisa o erro */ }
  mkAlertRefresh();
}
function mkAlertRefresh() {
  const el = document.getElementById('mk-alert-banner'); if (!el) return;
  el.outerHTML = mkAlertBannerHtml();
}
window.mkAlertEnable = mkAlertEnable;
function mkRenderSellerOrders() {
  const body = document.getElementById('mk-panel-body'); if (!body || mk.panelTab !== 'pedidos') return;
  const open = mkOrders.filter(function (o) { return ['aguardando_pagamento', 'pago', 'em_separacao', 'enviado'].indexOf(o.status) >= 0; });
  const done = mkOrders.filter(function (o) { return open.indexOf(o) < 0; });
  const note = !mk.seller.checkout_enabled ? '<div class="mk-note mk-note-warn">A compra pelo site ainda não está liberada (o MyDeck libera quando os pagamentos estiverem prontos). Pedidos só aparecem aqui depois disso.</div>' : '';
  body.innerHTML = mkAlertBannerHtml() + note + mkInterestsHtml() +
    '<h4 class="mk-sub">Em andamento (' + open.length + ')</h4>' + (open.length ? open.map(function (o) { return mkOrderCardHtml(o, true); }).join('') : '<div class="mk-empty">Nenhum pedido em andamento.</div>') +
    (done.length ? '<h4 class="mk-sub">Encerrados</h4>' + done.map(function (o) { return mkOrderCardHtml(o, true); }).join('') : '');
}
async function mkOrderAct(id, action) {
  let tracking = null, carrier = null, note = null;
  if (action === 'enviar') {
    const o = mkOrders.find(function (x) { return x.id === id; });
    if (o && o.delivery_type === 'envio') {
      tracking = prompt('Código de rastreio (obrigatório):'); if (!tracking) return;
      carrier = prompt('Transportadora (ex.: Correios, Jadlog) — opcional:') || null;
    }
  } else if (action === 'cancelar') {
    note = prompt('Motivo do cancelamento (o comprador vê):'); if (note === null) return;
    if (!confirm('Cancelar o pedido #' + id + '? O estoque volta para a loja' + (mkOrders.find(function (x) { return x.id === id; }).status !== 'aguardando_pagamento' ? ' e o comprador precisa ser reembolsado' : '') + '.')) return;
  } else if (action === 'confirmar_pagamento' && !confirm('Confirmar que o pagamento do pedido #' + id + ' foi recebido?')) return;
  const { error } = await sbClient.rpc('mk_order_action', { p_order: id, p_action: action, p_tracking: tracking, p_carrier: carrier, p_note: note });
  if (error) { mkToast(error.message, true); return; }
  mkToast('Pedido atualizado.');
  await mkLoadSellerOrders();
  mkLoadAll(true);
}
window.mkOrderAct = mkOrderAct; window.mkLoadSellerOrders = mkLoadSellerOrders;

// ══════════════════ painel do lojista: Pagamentos ══════════════════
async function mkPaymentsTabHtml() {
  const s = mk.seller;
  const { data: st } = await sbClient.rpc('mk_seller_pay_status', { p_seller: s.id });
  const status = st || {};
  const all = ['whatsapp', 'pix_manual', 'pix', 'card', 'boleto'];
  const adm = mk.isAdmin;
  return '<div class="mk-form">' +
    '<h4 class="mk-sub">Chave Pix da loja</h4>' +
    '<div class="mk-hint">Usada na forma “Pix direto para a loja”. Só o dono vê e altera. ' + (status.pix_key_set ? 'Chave cadastrada: <b>' + mkEsc(status.pix_key_hint) + '</b>' : '<b>Nenhuma chave cadastrada.</b>') + '</div>' +
    '<div class="mk-f-row"><label class="mk-f"><span>Chave Pix (CPF/CNPJ, e-mail, celular ou aleatória)</span><input id="mkp-key" autocomplete="off" placeholder="' + (status.pix_key_set ? 'deixe em branco para manter' : 'sua chave') + '"></label>' +
    '<label class="mk-f"><span>Nome do titular</span><input id="mkp-holder" value="' + mkEsc(status.pix_holder || '') + '" maxlength="80"></label></div>' +
    '<div id="mkp-err" class="mk-form-err"></div>' +
    '<div class="mk-form-actions"><button type="button" class="btn-mini mk-primary" onclick="mkSavePix()">💾 Salvar chave Pix</button></div>' +
    '<h4 class="mk-sub">Compra pelo site</h4>' +
    '<div class="mk-hint">Situação: <b>' + (s.checkout_enabled ? 'liberada ✅' : 'ainda não liberada') + '</b>. Formas ativas: <b>' + mkEsc((s.pay_methods || []).map(function (m) { return MK_PAY_LBL[m] || m; }).join(' · ') || 'nenhuma') + '</b>. ' +
      (adm ? '' : 'O MyDeck libera a compra pelo site e as formas de pagamento quando tudo estiver testado.') + '</div>' +
    (adm ? '<label class="mk-check"><input type="checkbox" id="mkp-enabled"' + (s.checkout_enabled ? ' checked' : '') + '> Liberar compra pelo site (checkout)</label>' +
      '<div class="mk-opts">' + all.map(function (m) { return '<label class="mk-opt"><input type="checkbox" class="mkp-m" value="' + m + '"' + ((s.pay_methods || []).indexOf(m) >= 0 ? ' checked' : '') + '> ' + mkEsc(MK_PAY_LBL[m]) + '</label>'; }).join('') + '</div>' +
      '<div class="mk-hint">Pix QR, cartão e boleto precisam do token do Mercado Pago configurado no servidor. Sem ele, o checkout recusa a compra antes de reservar estoque.</div>' +
      '<div class="mk-form-actions"><button type="button" class="btn-mini mk-primary" onclick="mkSaveCheckoutFlags()">💾 Salvar liberação</button></div>' : '') +
    '</div>';
}
async function mkSavePix() {
  const key = (document.getElementById('mkp-key') || {}).value || '', holder = (document.getElementById('mkp-holder') || {}).value || '';
  const err = document.getElementById('mkp-err');
  const { data: st } = await sbClient.rpc('mk_seller_pay_status', { p_seller: mk.seller.id });
  if (!key.trim() && !(st && st.pix_key_set)) { if (err) err.textContent = 'Digite a chave Pix.'; return; }
  if (!key.trim()) { if (err) err.textContent = 'Para trocar o titular, digite a chave de novo.'; return; }
  const { error } = await sbClient.rpc('mk_set_pix', { p_seller: mk.seller.id, p_key: key.trim(), p_holder: holder.trim() });
  if (error) { if (err) err.textContent = error.message; return; }
  mkToast('Chave Pix salva.');
  mkRenderPanelBody();
}
async function mkSaveCheckoutFlags() {
  const methods = Array.prototype.map.call(document.querySelectorAll('.mkp-m:checked'), function (e) { return e.value; });
  const enabled = !!(document.getElementById('mkp-enabled') || {}).checked;
  const { error } = await sbClient.from('mk_sellers').update({ checkout_enabled: enabled, pay_methods: methods }).eq('id', mk.seller.id);
  if (error) { mkToast(error.message, true); return; }
  mk.seller.checkout_enabled = enabled; mk.seller.pay_methods = methods;
  mkToast('Salvo.');
  mkRenderPanelBody();
}
window.mkSavePix = mkSavePix; window.mkSaveCheckoutFlags = mkSaveCheckoutFlags;
