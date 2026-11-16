// ================================================================
// MyDeck — Alertas de preço pessoais na aba "Busca de Promoções ML" (18/10/2026)
//
// O usuário logado toca no 🔔 de um produto, define o valor-alvo e é avisado (sino + push) quando o preço do Mercado Livre
// chegar nele. Banco: ml_price_alerts + RPCs ml_set_price_alert / ml_remove_price_alert; a varredura é o cron
// ml_check_price_alerts() de 5 em 5 min (ml_alertas_preco_18out2026.sql). Este arquivo só cuida da tela.
//
// Carrega DEPOIS de lojas_msrp.js (encadeia por cima de renderProductCard e renderLojas).
// ================================================================

let paAlerts = null;          // Map term_id -> { target_price, armed, last_notified_at }
let paLoadedFor = null;       // uid dos alertas carregados

function paLogged() { return typeof uid === 'function' && !!uid(); }

async function paLoad(force) {
  if (!paLogged() || typeof sbClient === 'undefined') { paAlerts = null; paLoadedFor = null; return null; }
  if (!force && paAlerts && paLoadedFor === uid()) return paAlerts;
  const { data, error } = await sbClient.from('ml_price_alerts').select('term_id,target_price,mode,armed,last_notified_at').order('created_at', { ascending: false });
  if (error) { console.warn('[alertas] não carregou:', error.message); return paAlerts; }
  paAlerts = new Map((data || []).map(function (a) { return [a.term_id, a]; }));
  paLoadedFor = uid();
  return paAlerts;
}

function paBrl(v) { return typeof fmtBRLLoja === 'function' ? fmtBRLLoja(v) : Number(v).toFixed(2).replace('.', ','); }
function paEsc(s) { return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
// "299,90" / "1.299,90" / "299.90" -> 299.9
function paParse(txt) {
  let s = String(txt == null ? '' : txt).replace(/[^\d.,]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

// ── sino no card do produto ────────────────────────────────────────
function paBellHtml(termId, price, boosters) {
  const on = paAlerts && paAlerts.has(termId);
  return '<button type="button" class="pa-bell' + (on ? ' pa-on' : '') + '" data-pa-term="' + termId + '" data-pa-price="' + (price == null ? '' : price) + '" data-pa-boost="' + (boosters > 0 ? boosters : '') + '"' +
    ' title="' + (on ? 'Você tem um alerta neste produto' : 'Avisar quando chegar no meu preço') + '" aria-label="Alerta de preço"' +
    ' onclick="paOpen(' + termId + ',event)">🔔</button>';
}
function paRefreshBells() {
  document.querySelectorAll('.pa-bell[data-pa-term]').forEach(function (b) {
    const on = !!(paAlerts && paAlerts.has(+b.getAttribute('data-pa-term')));
    b.classList.toggle('pa-on', on);
    b.title = on ? 'Você tem um alerta neste produto' : 'Avisar quando chegar no meu preço';
  });
  const cnt = document.getElementById('pa-count');
  if (cnt) cnt.textContent = paAlerts ? paAlerts.size : 0;
}

if (typeof window.renderProductCard === 'function') {
  const _origRenderProductCardAlert = window.renderProductCard;
  window.renderProductCard = function (term, history) {
    const html = _origRenderProductCardAlert.apply(this, arguments);
    const latest = history && history.length ? history[history.length - 1] : null;
    if (!term || !latest) return html;
    const open = html.indexOf('>');                 // fim da tag de abertura do card (<a ...> ou <div ...>)
    if (open < 0) return html;
    return html.slice(0, open + 1) + paBellHtml(term.id, +latest.price, +term.boosters || 0) + html.slice(open + 1);
  };
}

// ── janela de criar/editar alerta ──────────────────────────────────
function paOverlay() {
  let ov = document.getElementById('pa-ov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'pa-ov'; ov.className = 'ov';
    ov.addEventListener('click', function (e) { if (e.target === ov) paClose(); });
    ov.innerHTML = '<div class="modal pa-modal"><button type="button" class="mc-btn" onclick="paClose()" aria-label="Fechar">✕</button><div id="pa-body"></div></div>';
    document.body.appendChild(ov);
  }
  return ov;
}
function paClose() { const ov = document.getElementById('pa-ov'); if (ov) ov.classList.remove('open'); }
function paShow(html) { const ov = paOverlay(); document.getElementById('pa-body').innerHTML = html; ov.classList.add('open'); }

function paPushHint() {
  const st = typeof notifPushState === 'string' ? notifPushState : 'unknown';
  if (st === 'on') return '<div class="pa-hint">✅ Você receberá no celular e no sino do MyDeck.</div>';
  return '<div class="pa-hint">🔔 O aviso sempre chega no <b>sino</b> do MyDeck. Para receber também <b>no celular com o app fechado</b>, abra o sino e toque em “Ativar neste aparelho”.</div>';
}

let paCtx = null;   // { termId, name, price, boost, mode, existing } do alerta aberto na janela

async function paOpen(termId, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  if (!paLogged()) {
    if (typeof toast === 'function') toast('Entre na sua conta para criar alertas de preço.', 'error');
    if (typeof _showAuth === 'function') _showAuth(true);
    return;
  }
  await paLoad();
  const btn = ev && ev.currentTarget ? ev.currentTarget : document.querySelector('.pa-bell[data-pa-term="' + termId + '"]');
  const card = btn && btn.closest ? btn.closest('.product-card') : null;
  const nameEl = card ? card.querySelector('.product-name') : null;
  const cur = paAlerts && paAlerts.get(termId);
  paCtx = {
    termId: termId,
    name: nameEl ? nameEl.textContent.trim() : ('Produto #' + termId),
    price: btn ? parseFloat(btn.getAttribute('data-pa-price')) : NaN,
    boost: btn ? (parseInt(btn.getAttribute('data-pa-boost'), 10) || 0) : 0,
    mode: cur && cur.mode === 'booster' ? 'booster' : 'price',
    existing: cur || null,
  };
  if (paCtx.mode === 'booster' && !paCtx.boost) paCtx.mode = 'price';
  paRenderModal();
}

// valor "de referência" da janela: preço do produto ou preço por booster
function paBase() { const c = paCtx; return c.mode === 'booster' ? (isFinite(c.price) && c.boost ? c.price / c.boost : NaN) : c.price; }
function paSetMode(m) { if (!paCtx || (m === 'booster' && !paCtx.boost)) return; paCtx.mode = m; paRenderModal(); }

function paRenderModal() {
  const c = paCtx, base = paBase();
  const ex = c.existing && c.existing.mode === c.mode ? +c.existing.target_price : null;
  const suggest = ex != null ? ex : (isFinite(base) ? Math.floor(base * 0.9 * 100) / 100 : '');
  const unit = c.mode === 'booster' ? ' por booster' : '';
  paShow(
    '<h3 class="pa-h">🔔 Alerta de preço</h3>' +
    '<div class="pa-prod">' + paEsc(c.name) + '</div>' +
    (isFinite(c.price) ? '<div class="pa-cur">Agora no Mercado Livre: <b>R$ ' + paBrl(c.price) + '</b>' +
      (c.boost ? ' · <b>R$ ' + paBrl(c.price / c.boost) + '</b> por booster (' + c.boost + ')' : '') + '</div>' : '') +
    (c.boost ? '<div class="pa-modes"><button type="button" class="pa-mode' + (c.mode === 'price' ? ' on' : '') + '" onclick="paSetMode(\'price\')">Preço do produto</button>' +
      '<button type="button" class="pa-mode' + (c.mode === 'booster' ? ' on' : '') + '" onclick="paSetMode(\'booster\')">Valor por booster</button></div>' : '') +
    '<label class="pa-lbl" for="pa-target">Me avise quando chegar em (R$' + unit + ')</label>' +
    '<input id="pa-target" class="pa-input" inputmode="decimal" autocomplete="off" placeholder="ex.: ' + (c.mode === 'booster' ? '9,50' : '299,90') + '" value="' + (suggest === '' ? '' : paBrl(suggest)) + '" onkeydown="if(event.key===\'Enter\')paSave(' + c.termId + ')">' +
    (isFinite(base) ? '<div class="pa-quick">' + [5, 10, 15, 20].map(function (p) {
      return '<button type="button" class="btn-mini" onclick="paQuick(' + (Math.floor(base * (100 - p)) / 100) + ')">-' + p + '%</button>';
    }).join('') + '</div>' : '') +
    paPushHint() +
    '<div id="pa-err" class="pa-err"></div>' +
    '<div class="pa-actions"><button type="button" class="btn-mini pa-save" onclick="paSave(' + c.termId + ')">' + (c.existing ? 'Atualizar alerta' : 'Criar alerta') + '</button>' +
    (c.existing ? '<button type="button" class="btn-mini btn-mini-danger" onclick="paRemove(' + c.termId + ')">Remover alerta</button>' : '') + '</div>' +
    '<div class="pa-note">O preço é conferido a cada 15 minutos. Você é avisado quando ficar igual ou menor que o seu valor, sem contar cupons.' +
    (c.mode === 'booster' ? ' O valor por booster é o preço do produto ÷ ' + c.boost + ' boosters (brindes não são descontados).' : '') + '</div>'
  );
  const inp = document.getElementById('pa-target'); if (inp) { try { inp.focus(); inp.select(); } catch (e) { /* ok */ } }
}
function paQuick(v) { const i = document.getElementById('pa-target'); if (i) i.value = paBrl(v); }

async function paSave(termId) {
  const inp = document.getElementById('pa-target'), err = document.getElementById('pa-err');
  const v = paParse(inp ? inp.value : '');
  if (!(v > 0)) { if (err) err.textContent = 'Digite o valor em reais (ex.: 299,90).'; return; }
  if (err) err.textContent = '';
  const { error } = await sbClient.rpc('ml_set_price_alert', { p_term: termId, p_target: v, p_mode: paCtx && paCtx.termId === termId ? paCtx.mode : 'price' });
  if (error) { if (err) err.textContent = error.message; return; }
  await paLoad(true);
  paRefreshBells();
  paClose();
  if (typeof toast === 'function') toast('Alerta criado: aviso em R$ ' + paBrl(v) + (paCtx && paCtx.mode === 'booster' ? ' por booster' : '') + ' 🔔');
}
async function paRemove(termId) {
  const { error } = await sbClient.rpc('ml_remove_price_alert', { p_term: termId });
  if (error) { const e = document.getElementById('pa-err'); if (e) e.textContent = error.message; return; }
  await paLoad(true);
  paRefreshBells();
  paClose();
  if (typeof toast === 'function') toast('Alerta removido.');
}

// ── "Meus alertas" ─────────────────────────────────────────────────
async function paOpenList() {
  if (!paLogged()) {
    if (typeof toast === 'function') toast('Entre na sua conta para ver seus alertas.', 'error');
    if (typeof _showAuth === 'function') _showAuth(true);
    return;
  }
  await paLoad(true);
  const ids = paAlerts ? Array.from(paAlerts.keys()) : [];
  if (!ids.length) { paShow('<h3 class="pa-h">🔔 Meus alertas de preço</h3><div class="pa-empty">Você ainda não tem alertas.<br>Toque no 🔔 de qualquer produto para criar um.</div>'); return; }
  paShow('<h3 class="pa-h">🔔 Meus alertas de preço</h3><div class="pa-empty">Carregando…</div>');
  const [t, h] = await Promise.all([
    sbClient.from('ml_search_terms').select('id,label,term,boosters').in('id', ids),
    sbClient.from('ml_price_history').select('term_id,price,found_at').in('term_id', ids).order('found_at', { ascending: false }).limit(ids.length * 6),
  ]);
  const names = new Map((t.data || []).map(function (x) { return [x.id, x.label || x.term]; }));
  const boosts = new Map((t.data || []).map(function (x) { return [x.id, +x.boosters || 0]; }));
  const now = new Map();
  (h.data || []).forEach(function (r) { if (!now.has(r.term_id)) now.set(r.term_id, +r.price); });
  const rows = ids.map(function (id) {
    const a = paAlerts.get(id), p = now.get(id), isB = a.mode === 'booster' && boosts.get(id) > 0;
    const pv = p != null ? (isB ? p / boosts.get(id) : p) : null;
    const hit = pv != null && pv <= +a.target_price;
    return '<div class="pa-row"><div class="pa-row-main"><div class="pa-row-name">' + paEsc(names.get(id) || ('Produto #' + id)) + '</div>' +
      '<div class="pa-row-sub">Alvo <b>R$ ' + paBrl(a.target_price) + (isB ? ' por booster' : '') + '</b> · agora ' + (pv != null ? '<b class="' + (hit ? 'pa-hit' : '') + '">R$ ' + paBrl(pv) + (isB ? ' por booster' : '') + '</b>' : '—') +
      (hit ? ' ✅ no alvo' : '') + '</div></div>' +
      '<div class="pa-row-act"><button type="button" class="btn-mini" onclick="paOpenFrom(' + id + ',' + (p != null ? p : 'null') + ',' + (boosts.get(id) || 0) + ')">Editar</button>' +
      '<button type="button" class="btn-mini btn-mini-danger" onclick="paRemoveFromList(' + id + ')">✕</button></div></div>';
  }).join('');
  paShow('<h3 class="pa-h">🔔 Meus alertas de preço <span class="pa-n">(' + ids.length + '/30)</span></h3><div class="pa-list">' + rows + '</div>' + paPushHint());
}
async function paRemoveFromList(termId) {
  if (!confirm('Remover este alerta?')) return;
  const { error } = await sbClient.rpc('ml_remove_price_alert', { p_term: termId });
  if (error) { if (typeof toast === 'function') toast(error.message, 'error'); return; }
  await paLoad(true); paRefreshBells(); paOpenList();
}
// editar a partir da lista: usa o sino do card se ele estiver na tela; senão monta o contexto com os dados da lista
function paOpenFrom(termId, price, boost) {
  const card = document.querySelector('.pa-bell[data-pa-term="' + termId + '"]');
  if (card) { paOpen(termId, { preventDefault() {}, stopPropagation() {}, currentTarget: card }); return; }
  const cur = paAlerts && paAlerts.get(termId);
  paCtx = { termId: termId, name: 'Produto #' + termId, price: price == null ? NaN : +price, boost: +boost || 0,
            mode: cur && cur.mode === 'booster' && +boost ? 'booster' : 'price', existing: cur || null };
  paRenderModal();
}

// ── barra "Meus alertas" no topo da aba ────────────────────────────
function paEnsureBar() {
  const wrap = document.getElementById('lojas-wrap');
  if (!wrap || document.getElementById('pa-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'pa-bar'; bar.className = 'pa-bar';
  bar.innerHTML = '<span>🔔 Receba um aviso quando um produto chegar no seu preço: toque no sino do card.</span>' +
    '<button type="button" class="btn-mini" onclick="paOpenList()">Meus alertas (<span id="pa-count">' + (paAlerts ? paAlerts.size : 0) + '</span>)</button>';
  const anchor = wrap.querySelector('.affiliate-disclosure');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling); else wrap.insertBefore(bar, wrap.firstChild);
}
if (typeof window.renderLojas === 'function') {
  const _origRenderLojasAlert = window.renderLojas;
  window.renderLojas = async function () {
    const r = await _origRenderLojasAlert.apply(this, arguments);
    try { await paLoad(); paEnsureBar(); paRefreshBells(); } catch (e) { /* alertas não podem quebrar a aba */ }
    return r;
  };
}

// ── sino do site: ícone e clique do aviso (abre a oferta) ──────────
(function setupPriceAlertNotifications() {
  try { if (typeof NOTIF_ICON !== 'undefined') NOTIF_ICON.price_alert = '🔔'; } catch (e) { /* sino não carregado */ }
  if (typeof window.notifRoute === 'function') {
    const _origNotifRoute = window.notifRoute;
    window.notifRoute = function (n) {
      if (n && n.type === 'price_alert') {
        const url = n.data && typeof n.data.url === 'string' ? n.data.url : null;
        if (url && /^https:\/\//.test(url)) window.open(url, '_blank', 'noopener');
        else if (typeof goToTab === 'function') goToTab('lojas');
        return;
      }
      return _origNotifRoute.apply(this, arguments);
    };
  }
})();

// trocou de conta: esquece os alertas da anterior
document.addEventListener('visibilitychange', function () { if (paLoadedFor && paLogged() && paLoadedFor !== uid()) { paAlerts = null; paLoadedFor = null; } });

window.paOpen = paOpen; window.paClose = paClose; window.paSave = paSave; window.paRemove = paRemove; window.paQuick = paQuick;
window.paSetMode = paSetMode; window.paOpenList = paOpenList; window.paRemoveFromList = paRemoveFromList; window.paOpenFrom = paOpenFrom;
