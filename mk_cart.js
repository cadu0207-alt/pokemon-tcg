// ================================================================
// MyDeck — Loja Toybox · carrinho (mk_cart.js, 17/10/2026)
// Antes cada compra/contato era de UM produto só. Agora o visitante monta um carrinho (guardado no navegador, por loja),
// vê o total, calcula o frete do carrinho inteiro e chama a loja no WhatsApp com a lista de tudo. O checkout com vários
// itens vem em seguida (mk_orders.js): o servidor (mk-shop) e o banco (mk_create_order) já aceitam até 20 itens.
// Carrega DEPOIS de mk_core.js/mk_store.js/mk_orders.js. Sem login o visitante já monta e cota; a conta só é exigida
// no pagamento, como antes.
// ================================================================

const MK_CART_MAX_ITEMS = 20;     // mesmo teto do servidor (mk-shop / mk_create_order)
let mkCartState = null;           // { items: [{ id, qty }] }

function mkCartKey() { return 'mk_cart_v1:' + MK_SLUG; }
function mkCartLoad() {
  if (mkCartState) return mkCartState;
  let items = [];
  try {
    const raw = JSON.parse(localStorage.getItem(mkCartKey()) || '{}');
    if (raw && Array.isArray(raw.items)) {
      items = raw.items.filter(function (i) { return i && Number.isInteger(i.id) && Number.isInteger(i.qty) && i.qty >= 1; }).slice(0, MK_CART_MAX_ITEMS);
    }
  } catch (e) { items = []; }
  mkCartState = { items: items };
  return mkCartState;
}
function mkCartSave() { try { localStorage.setItem(mkCartKey(), JSON.stringify(mkCartLoad())); } catch (e) { /* modo privado */ } }

// Resolve o carrinho contra a loja AGORA: some produto que saiu do ar, ajusta quantidade ao estoque atual.
// Devolve { lines:[{p, qty, price}], notes:[...avisos], subtotal }.
function mkCartResolve() {
  const st = mkCartLoad(), lines = [], notes = [];
  let changed = false;
  st.items = st.items.filter(function (it) {
    const p = mk.products.find(function (x) { return x.id === it.id; });
    if (!p || p.status !== 'ativo') { notes.push('Um produto saiu da loja e foi tirado do carrinho.'); changed = true; return false; }
    const avail = mkQty(p);
    if (avail <= 0) { notes.push('"' + p.title + '" esgotou e foi tirado do carrinho.'); changed = true; return false; }
    if (it.qty > avail) { notes.push('"' + p.title + '": só restam ' + avail + ' — ajustei a quantidade.'); it.qty = avail; changed = true; }
    lines.push({ p: p, qty: it.qty, price: Number(p.price) });
    return true;
  });
  if (changed) mkCartSave();
  const subtotal = Math.round(lines.reduce(function (s, l) { return s + l.price * l.qty; }, 0) * 100) / 100;
  return { lines: lines, notes: notes, subtotal: subtotal };
}
function mkCartCount() { return mkCartLoad().items.reduce(function (n, i) { return n + i.qty; }, 0); }

function mkCartAdd(pid, qty) {
  const p = mk.products.find(function (x) { return x.id === pid; });
  if (!p || p.status !== 'ativo') { mkToast('Esse produto não está mais disponível.', true); return; }
  const avail = mkQty(p);
  if (avail <= 0) { mkToast('Produto esgotado.', true); return; }
  const st = mkCartLoad();
  const cur = st.items.find(function (i) { return i.id === pid; });
  if (cur) {
    if (cur.qty >= avail) { mkToast('Você já tem todas as ' + avail + ' unidades disponíveis no carrinho.', true); return; }
    cur.qty = Math.min(avail, cur.qty + (qty || 1));
  } else {
    if (st.items.length >= MK_CART_MAX_ITEMS) { mkToast('O carrinho aceita até ' + MK_CART_MAX_ITEMS + ' produtos diferentes.', true); return; }
    st.items.push({ id: pid, qty: Math.min(avail, qty || 1) });
  }
  mkCartSave();
  mkToast('🛒 Adicionado ao carrinho');
  mkCartRefreshUI();
  if (typeof gtag === 'function') { try { gtag('event', 'add_to_cart', { items: [{ item_id: String(pid), item_name: p.title, price: Number(p.price), quantity: 1 }] }); } catch (e) { /* ok */ } }
}
function mkCartSetQty(pid, q) {
  const st = mkCartLoad(), it = st.items.find(function (i) { return i.id === pid; });
  if (!it) return;
  const p = mk.products.find(function (x) { return x.id === pid; });
  const max = p ? Math.max(1, mkQty(p)) : it.qty;
  it.qty = Math.max(1, Math.min(max, parseInt(q, 10) || 1));
  mkCartSave(); mkCartRefreshUI(); mkCartRenderModal();
}
function mkCartRemove(pid) {
  const st = mkCartLoad();
  st.items = st.items.filter(function (i) { return i.id !== pid; });
  mkCartSave(); mkCartRefreshUI(); mkCartRenderModal();
}
function mkCartClear() {
  mkCartLoad().items = []; mkCartSave(); mkCartRefreshUI(); mkCartRenderModal();
}

// ── UI: botão do cabeçalho + barra fixa ────────────────────────────────────────────────────────
function mkCartHeroBtnHtml() {
  const n = mkCartCount();
  return '<button type="button" class="mk-manage-btn mk-cart-hero" onclick="mkOpenCart()" aria-label="Abrir o carrinho">🛒 Carrinho<span class="mk-cart-badge" id="mk-cart-badge"' + (n ? '' : ' hidden') + '>' + n + '</span></button>';
}
function mkCartBarHtml() { return '<div id="mk-cart-bar" class="mk-cart-bar" hidden></div>'; }
function mkCartRefreshUI() {
  const n = mkCartCount();
  const badge = document.getElementById('mk-cart-badge');
  if (badge) { badge.textContent = n; badge.hidden = !n; }
  const bar = document.getElementById('mk-cart-bar');
  if (bar) {
    if (!n) { bar.hidden = true; bar.innerHTML = ''; }
    else {
      const r = mkCartResolve();
      bar.hidden = false;
      bar.innerHTML = '<span>🛒 <b>' + mkCartCount() + '</b> ite' + (mkCartCount() === 1 ? 'm' : 'ns') + ' · <b>' + mkMoney(r.subtotal) + '</b></span>' +
        '<button type="button" class="mk-cart-bar-btn" onclick="mkOpenCart()">Ver carrinho</button>';
    }
  }
}
function mkCartAddBtnHtml(p) {   // botão "+" do cartão e botão grande da página do produto
  if (mkQty(p) <= 0 || p.status !== 'ativo') return '';
  return '';
}

// ── modal do carrinho ──────────────────────────────────────────────────────────────────────────
let mkCartCep = '';
let mkCartShip = null;       // { loading, options, error, text }

function mkOpenCart() {
  mkCartCep = mkLsGetSafe('mk_cep');
  mkCartShip = null;
  mkOpenModal('<div id="mk-cart-body"></div>', { wide: true });
  mkCartRenderModal();
}
window.mkOpenCart = mkOpenCart;
function mkLsGetSafe(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }

function mkCartRenderModal() {
  const box = document.getElementById('mk-cart-body');
  if (!box) return;
  const r = mkCartResolve();
  const s = mk.seller;
  if (!r.lines.length) {
    box.innerHTML = '<h3 class="mk-cart-h">🛒 Seu carrinho</h3><div class="mk-empty">Seu carrinho está vazio.<br>Toque em <b>＋</b> nos produtos para adicionar.</div>' +
      '<button type="button" class="btn-mini" onclick="mkCloseModal()">Continuar comprando</button>';
    return;
  }
  const wa = mkDigits(s.whatsapp);
  const rows = r.lines.map(function (l) {
    const cover = mkSafeUrl(mkCover(l.p)), max = mkQty(l.p);
    return '<div class="mk-cart-row">' +
      '<div class="mk-cart-img">' + (cover ? '<img src="' + mkEsc(cover) + '" alt="">' : (MK_KIND_ICON[l.p.kind] || '🧸')) + '</div>' +
      '<div class="mk-cart-info"><div class="mk-cart-t">' + mkEsc(l.p.title) + '</div>' +
        '<div class="mk-cart-p">' + mkMoney(l.price) + ' cada' + (max <= 3 ? ' · <span class="mk-cart-low">restam ' + max + '</span>' : '') + '</div></div>' +
      '<div class="mk-cart-qty">' +
        '<button type="button" aria-label="Diminuir" onclick="mkCartSetQty(' + l.p.id + ',' + (l.qty - 1) + ')"' + (l.qty <= 1 ? ' disabled' : '') + '>−</button>' +
        '<span aria-live="polite">' + l.qty + '</span>' +
        '<button type="button" aria-label="Aumentar" onclick="mkCartSetQty(' + l.p.id + ',' + (l.qty + 1) + ')"' + (l.qty >= max ? ' disabled' : '') + '>＋</button></div>' +
      '<div class="mk-cart-sub">' + mkMoney(l.price * l.qty) + '</div>' +
      '<button type="button" class="mk-cart-x" aria-label="Remover do carrinho" onclick="mkCartRemove(' + l.p.id + ')">🗑️</button></div>';
  }).join('');

  const ship = mkCartShip;
  let shipHtml = '<div class="mk-ship"><div class="mk-ship-t">🚚 Frete do carrinho</div>' +
    '<div class="mk-ship-row"><input id="mk-cart-cep" inputmode="numeric" maxlength="9" placeholder="Seu CEP" value="' + mkEsc(mkFmtCep(mkCartCep)) + '" oninput="this.value=mkFmtCep(this.value)" onkeydown="if(event.key===\'Enter\')mkCartQuote()">' +
    '<button type="button" class="btn-mini" onclick="mkCartQuote()">Calcular</button></div><div class="mk-ship-out">';
  if (ship && ship.loading) shipHtml += 'Calculando…';
  else if (ship && ship.error) shipHtml += '<span class="mk-ship-err">' + mkEsc(ship.error) + '</span>';
  else if (ship && ship.options) {
    shipHtml += '<ul class="mk-ship-list">' + ship.options.map(function (o) { return '<li>' + mkEsc(mkShipLabel(o)) + '</li>'; }).join('') + '</ul>' +
      '<div class="mk-prod-hint">Para o carrinho inteiro (' + mkCartCount() + ' ite' + (mkCartCount() === 1 ? 'm' : 'ns') + ' num pacote só). Postagem em até ' + mkEsc(ship.handling) + ' dias úteis após o pagamento.</div>';
  }
  shipHtml += '</div></div>';

  const cheapest = ship && ship.options && ship.options.length ? ship.options[0] : null;
  box.innerHTML = '<h3 class="mk-cart-h">🛒 Seu carrinho <span class="mk-cart-n">(' + mkCartCount() + ' ite' + (mkCartCount() === 1 ? 'm' : 'ns') + ')</span></h3>' +
    (r.notes.length ? '<div class="mk-note mk-note-warn">' + r.notes.map(mkEsc).join('<br>') + '</div>' : '') +
    '<div class="mk-cart-list">' + rows + '</div>' +
    '<div class="mk-cart-total"><span>Subtotal</span><b>' + mkMoney(r.subtotal) + '</b></div>' +
    (cheapest ? '<div class="mk-cart-total mk-cart-total-sub"><span>+ frete (' + mkEsc(cheapest.service) + ')</span><b>' + (cheapest.price > 0 ? mkMoney(cheapest.price) : 'grátis') + '</b></div>' +
      '<div class="mk-cart-total"><span>Total estimado</span><b>' + mkMoney(r.subtotal + cheapest.price) + '</b></div>' : '') +
    shipHtml +
    '<div class="mk-cart-actions">' +
      (typeof mkCartCheckoutBtnHtml === 'function' ? mkCartCheckoutBtnHtml() : '') +
      (wa ? '<a class="mk-buy-btn' + (s.checkout_enabled ? ' mk-buy-alt' : '') + '" target="_blank" rel="noopener" href="' + mkEsc(mkCartWhatsUrl(r, wa)) + '" onclick="mkCartWaClicked()">💬 Chamar a loja no WhatsApp com o carrinho</a>' : '') +
      (!s.checkout_enabled && wa ? '<div class="mk-prod-hint">A compra direto pelo site chega em breve. Por enquanto a loja combina pagamento e envio pelo WhatsApp.</div>' : '') +
      '<button type="button" class="mk-cart-clear" onclick="if(confirm(\'Esvaziar o carrinho?\'))mkCartClear()">Esvaziar carrinho</button>' +
    '</div>';
}

// Mensagem do WhatsApp com TODOS os itens (a URL tem limite: lista curta quando o carrinho é grande)
function mkCartWhatsMessage(r) {
  const lines = r.lines.map(function (l) { return '• ' + l.qty + '× ' + l.p.title + ' — ' + mkMoney(l.price * l.qty); });
  let shown = lines, extra = '';
  while (shown.join('\n').length > 900 && shown.length > 3) { shown = shown.slice(0, -1); }
  if (shown.length < lines.length) extra = '\n… e mais ' + (lines.length - shown.length) + ' ite' + (lines.length - shown.length === 1 ? 'm' : 'ns') + ' (total completo abaixo)';
  const cep = mkDigits(mkCartCep);
  return 'Oi! Quero estes itens da loja no MyDeck:\n' + shown.join('\n') + extra +
    '\nSubtotal: ' + mkMoney(r.subtotal) + ' (sem frete)' +
    (cep.length === 8 ? '\nMeu CEP: ' + mkFmtCep(cep) : '') +
    '\nhttps://mydecktcg.com.br/#mk';
}
function mkCartWhatsUrl(r, wa) { return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(mkCartWhatsMessage(r)); }
function mkCartWaClicked() {
  if (typeof gtag === 'function') { try { gtag('event', 'mk_cart_whatsapp', { itens: mkCartCount() }); } catch (e) { /* ok */ } }
  const r = mkCartResolve();
  mkRegisterInterest(r.lines.map(function (l) { return { product_id: l.p.id, qty: l.qty }; }));
}

// 17/10/2026: clicar em "Chamar a loja no WhatsApp" NÃO cria pedido nem mexe no estoque: registra um INTERESSE de 2 horas
// (aparece no painel da loja e avisa a equipe). Quando a venda fecha no WhatsApp, o lojista marca "vendido" e só aí o
// estoque baixa. Só cliente logado gera interesse; visitante só abre o WhatsApp. Nunca bloqueia nem atrasa a abertura do WhatsApp.
function mkRegisterInterest(items) {
  try {
    if (!items || !items.length || !mk.seller || !(typeof uid === 'function' && uid()) || typeof sbClient === 'undefined') return;
    const name = (typeof userProfile !== 'undefined' && userProfile && userProfile.full_name) || mkLsGetSafe('mk_name') || null;
    sbClient.rpc('mk_register_interest', { p_seller: mk.seller.id, p_items: items, p_name: name }).then(function (res) {
      if (res && res.error) console.warn('[mk] interesse não registrado:', res.error.message);
    }, function () { /* sem rede: o WhatsApp já abriu, segue */ });
  } catch (e) { /* nunca atrapalha o clique */ }
}
function mkProductWaClicked(pid) {
  if (typeof gtag === 'function') { try { gtag('event', 'mk_product_whatsapp', { product_id: pid }); } catch (e) { /* ok */ } }
  mkRegisterInterest([{ product_id: pid, qty: 1 }]);
}
window.mkProductWaClicked = mkProductWaClicked;

// Frete do carrinho INTEIRO (o servidor soma peso/medidas num pacote). Mensagens específicas pra cada causa.
async function mkCartQuote() {
  const inp = document.getElementById('mk-cart-cep');
  const cep = mkDigits(inp ? inp.value : mkCartCep);
  mkCartCep = cep;
  if (cep.length !== 8) { mkCartShip = { error: 'Digite o CEP com 8 números.' }; mkCartRenderModal(); return; }
  try { localStorage.setItem('mk_cep', cep); } catch (e) { /* ok */ }
  const r = mkCartResolve();
  if (!r.lines.length) { mkCartRenderModal(); return; }
  mkCartShip = { loading: true }; mkCartRenderModal();
  const res = await mkShopCall({ action: 'quote', items: r.lines.map(function (l) { return { product_id: l.p.id, qty: l.qty }; }), destination_cep: cep });
  if (!document.getElementById('mk-cart-body')) return;
  if (!res.ok) { mkCartShip = { error: res.error || 'Não consegui calcular o frete.' }; }
  else if (!res.options || !res.options.length) { mkCartShip = { error: mkShipEmptyMessage(res) }; }
  else { mkCartShip = { options: res.options, handling: res.handling_days }; }
  mkCartRenderModal();
}
window.mkCartQuote = mkCartQuote;

// Por que não veio nenhuma opção de frete? (antes: sempre "A loja ainda não tem frete automático configurado")
function mkShipEmptyMessage(res) {
  const w = (res && res.warnings) || [];
  if (w.indexOf('seller_without_cep') >= 0) {
    return mk.isMember
      ? 'Falta o CEP de postagem da loja. Abra Gerenciar loja → Configurações e preencha "CEP de postagem" para ligar o frete automático.'
      : 'O frete automático está indisponível agora. Combine o envio pelo WhatsApp.';
  }
  if (w.indexOf('carrier_not_configured') >= 0) {
    return mk.isMember
      ? 'A chave da transportadora (SuperFrete) ainda não está configurada no servidor.'
      : 'O frete automático está indisponível agora. Combine o envio pelo WhatsApp.';
  }
  return 'A loja ainda não tem frete automático configurado. Combine o envio pelo WhatsApp.';
}
window.mkShipEmptyMessage = mkShipEmptyMessage;

// depois de cada recarga da loja, o carrinho e os selos se ajustam ao estoque novo
document.addEventListener('DOMContentLoaded', function () { setTimeout(mkCartRefreshUI, 1500); });
window.mkCartAdd = mkCartAdd; window.mkCartSetQty = mkCartSetQty; window.mkCartRemove = mkCartRemove; window.mkCartClear = mkCartClear;
window.mkCartHeroBtnHtml = mkCartHeroBtnHtml; window.mkCartBarHtml = mkCartBarHtml; window.mkCartRefreshUI = mkCartRefreshUI;
window.mkCartWaClicked = mkCartWaClicked;
