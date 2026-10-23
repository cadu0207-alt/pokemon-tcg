// ================================================================
// MyDeck — Loja Toybox · CONSIGNAÇÃO (mk_consign.js) — 23/10/2026
// O usuário envia cartas ao Alex (Toybox), que confere, publica na loja e vende por conta dele.
// Banco: mk_consignacao_23out2026.sql (tabelas mk_consign*, escrita só por funções mk_consign_*).
// Duas telas:
//   • dono das cartas  → seção "Venda pela Toybox" na aba Compra/Venda (#mk-cons-box)
//   • equipe da loja   → aba "📥 Consignação" do painel do lojista (mk_panel.js)
// A consignação nasce DESLIGADA (mk_sellers.consign_enabled): o admin liga depois que o termo passar por advogado.
// ================================================================

const mkc = {
  seller: null, term: null, isAdmin: false,
  mine: [], items: [], returns: [], ship: {},
  loadedFor: null, loading: null,
  form: null, idx: null, res: {},
  panel: { consignments: [], items: [], returns: [], priv: null, filter: 'andamento', loaded: false },
};

const MKC_CST = { enviada: 'A caminho da loja', recebida: 'Recebida pela loja', encerrada: 'Encerrada', cancelada: 'Cancelada' };
const MKC_IST = {
  aguardando: 'Em análise', sugestao: 'Preço sugerido', aprovada: 'Aprovada — a publicar', recusada: 'Recusada', a_venda: 'À venda',
  vendida: 'Vendida', devolucao: 'Em devolução', devolvida: 'Devolvida',
};
const MKC_RST = {
  pedida: 'Aguardando a loja informar o frete', frete_informado: 'Frete informado — pague e avise a loja', frete_pago: 'Frete pago — a loja vai enviar',
  enviada: 'Enviada', cancelada: 'Cancelada',
};
const MKC_DAY = 86400000;

function mkcDate(d) { const t = Date.parse(d || ''); return Number.isFinite(t) ? new Date(t).toLocaleDateString('pt-BR') : ''; }
function mkcPct(v) { return String(Number(v)).replace('.', ','); }
function mkcDoc(d) { d = String(d || '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d; }
function mkcSellerWaUrl(text) {
  const wa = mkDigits(mkc.seller && mkc.seller.whatsapp);
  return wa ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent(text) : '';
}
function mkcErr(e) { return (e && e.message) ? e.message : 'Algo deu errado. Tente de novo.'; }
function mkcItemLine(it) {
  const lang = it.language ? ({ 'pt-BR': '🇧🇷', en: '🇺🇸', ja: '🇯🇵', zh: '🇨🇳' }[it.language] || '') : '';
  return '<b>' + mkEsc(it.name) + '</b>' + (it.card_n ? ' <span class="mk-hint">#' + mkEsc(it.card_n) + '</span>' : '') +
    '<div class="mk-hint">' + [it.set_label ? mkEsc(it.set_label) : '', lang, it.condition ? mkEsc(it.condition) : ''].filter(Boolean).join(' · ') + '</div>';
}
// o termo guarda {{LOJA}} {{CNPJ}} {{COMISSAO}}; aqui entram os dados reais da loja
function mkcTermHtml(commission) {
  const s = mkc.seller || {}, t = mkc.term;
  if (!t) return '';
  const body = t.body.replace(/\{\{LOJA\}\}/g, s.legal_name || s.name || 'Toybox').replace(/\{\{CNPJ\}\}/g, mkcDoc(s.cnpj) || '—')
    .replace(/\{\{COMISSAO\}\}/g, mkcPct(commission != null ? commission : s.consign_commission_pct));
  return mkMd(body);
}

// ══════════════════ DONO DAS CARTAS ══════════════════
async function mkcLoadUser(force) {
  const me = (typeof uid === 'function' && uid()) || null;
  if (!me) { mkc.mine = []; mkc.items = []; mkc.returns = []; mkc.loadedFor = null; return; }
  if (!force && mkc.loadedFor === me) return;
  if (mkc.loading) return mkc.loading;
  mkc.loading = (async function () {
    try {
      const [s, t, c, i, r, a] = await Promise.all([
        sbClient.from('mk_sellers').select('*').eq('slug', MK_SLUG).maybeSingle(),
        sbClient.from('mk_consign_terms').select('*').order('version', { ascending: false }).limit(1).maybeSingle(),
        sbClient.from('mk_consignments').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(100),
        sbClient.from('mk_consign_items').select('*').eq('user_id', me).order('id').limit(1000),
        sbClient.from('mk_consign_returns').select('*').eq('user_id', me).order('id', { ascending: false }).limit(100),
        sbClient.rpc('mk_is_admin'),
      ]);
      mkc.seller = s.data || null; mkc.term = t.data || null; mkc.isAdmin = a.data === true;
      mkc.mine = c.data || []; mkc.items = i.data || []; mkc.returns = r.data || [];
      mkc.loadedFor = me;
    } catch (e) { console.error('[mkc] carga', e); }
  })();
  try { await mkc.loading; } finally { mkc.loading = null; }
}

async function mkcRenderUser() {
  const box = document.getElementById('mk-cons-box');
  if (!box) return;
  if (!(typeof uid === 'function' && uid())) { box.innerHTML = ''; return; }
  await mkcLoadUser(false);
  const s = mkc.seller;
  if (!s || s.status !== 'ativa' || !mkc.term || (!s.consign_enabled && !mkc.isAdmin && !mkc.mine.length)) { box.innerHTML = ''; return; }
  const pct = mkcPct(s.consign_commission_pct);
  box.innerHTML = '<div class="mkc-card mkc-intro">' +
    '<div class="mkc-intro-h"><div><div class="mkc-kicker">Novo · consignação</div><div class="mkc-title">📦 Venda suas cartas pela ' + mkEsc(s.name) + '</div></div>' +
      '<button type="button" class="btn-add" onclick="mkcOpenForm()">+ ENVIAR CARTAS</button></div>' +
    '<ul class="mkc-steps"><li>Você manda as cartas ao <b>Alex</b> (' + mkEsc(s.name) + ') e define o preço de cada uma.</li>' +
      '<li>Ele confere em até <b>30 dias</b>, publica na loja e vende. Depois que ele recebe, <b>a guarda das cartas é dele</b>.</li>' +
      '<li>Vendeu? Você recebe por Pix o valor menos <b>' + pct + '%</b> de comissão. Se quiser as cartas de volta, é só pedir (o frete de volta é seu).</li>' +
      '<li>Você escolhe, carta a carta, se aceita <b>leilão ao vivo</b> na live da loja.</li></ul>' +
    '<button type="button" class="mkc-link" onclick="mkcShowTerm()">Ler o termo de consignação</button>' +
    (!s.consign_enabled ? '<div class="mk-hint" style="margin-top:6px">⚠️ Desligada para o público: só você (admin) vê esta seção.</div>' : '') +
    '</div>' +
    (mkc.mine.length ? '<div class="mkc-list">' + mkc.mine.map(mkcConsignmentCardUser).join('') + '</div>' : '');
  // endereço de entrega das remessas ainda a caminho
  mkc.mine.filter(function (c) { return c.status === 'enviada' && !mkc.ship[c.id]; }).forEach(function (c) {
    sbClient.rpc('mk_consign_ship_info', { p_consignment: c.id }).then(function (r) {
      if (r.data) { mkc.ship[c.id] = r.data; const el = document.getElementById('mkc-ship-' + c.id); if (el) el.innerHTML = mkcShipHtml(r.data); }
    });
  });
}
function mkcShipHtml(d) {
  return d && d.address ? '<b>Envie para:</b> ' + (d.receiver ? mkEsc(d.receiver) + ' — ' : '') + mkEsc(d.address) : '';
}

function mkcConsignmentCardUser(c) {
  const items = mkc.items.filter(function (i) { return i.consignment_id === c.id; });
  const rets = mkc.returns.filter(function (r) { return r.consignment_id === c.id; });
  const total = items.reduce(function (a, i) { return a + i.qty; }, 0);
  let info = '';
  if (c.status === 'enviada') {
    info = '<div id="mkc-ship-' + c.id + '" class="mkc-note">' + mkcShipHtml(mkc.ship[c.id]) + '</div>' +
      '<div class="mkc-note">Embale com sleeves, toploaders e caixa rígida e use envio com rastreio. Até a loja confirmar o recebimento, o risco do transporte é seu.</div>' +
      '<div class="mkc-track"><input id="mkc-car-' + c.id + '" placeholder="Transportadora" value="' + mkEsc(c.carrier || '') + '" maxlength="40">' +
      '<input id="mkc-trk-' + c.id + '" placeholder="Código de rastreio" value="' + mkEsc(c.tracking_code || '') + '" maxlength="60">' +
      '<button type="button" class="btn-mini" onclick="mkcSaveTracking(' + c.id + ')">Salvar rastreio</button>' +
      '<button type="button" class="btn-mini btn-mini-danger" onclick="mkcCancel(' + c.id + ')">Cancelar remessa</button></div>';
  } else if (c.status === 'recebida') {
    const rcv = Date.parse(c.received_at), cyc = (c.cycle_days || 90) * MKC_DAY;
    const n = Math.floor((Date.now() - rcv) / cyc) + 1, renew = new Date(rcv + n * cyc).toLocaleDateString('pt-BR');
    const waiting = items.some(function (i) { return i.status === 'aguardando'; });
    info = '<div class="mkc-note">Recebida em ' + mkcDate(c.received_at) + '. As cartas estão sob a guarda da loja.' +
      (waiting ? ' A loja tem até <b>' + mkcDate(c.review_deadline) + '</b> para analisar.' : '') +
      '<br>Ciclo ' + n + ' de ' + (c.cycle_days || 90) + ' dias: <b>renova sozinho em ' + renew + '</b> enquanto você não pedir as cartas de volta.</div>';
  }
  const canReturn = c.status === 'recebida' && items.some(mkcReturnable);
  return '<div class="mkc-card">' +
    '<div class="mkc-head"><b>Remessa #' + c.id + '</b><span class="mk-chip">' + total + ' carta(s)</span><span class="mkc-st mkc-st-' + c.status + '">' + MKC_CST[c.status] + '</span>' +
      '<span class="mkc-when">' + mkcDate(c.created_at) + '</span></div>' + info +
    '<div class="mkc-items">' + items.map(function (i) { return mkcItemRowUser(i, c); }).join('') + '</div>' +
    (rets.length ? '<div class="mkc-rets">' + rets.map(mkcReturnRowUser).join('') + '</div>' : '') +
    (canReturn ? '<div class="mkc-foot"><button type="button" class="btn-mini" onclick="mkcOpenReturn(' + c.id + ')">📮 Pedir cartas de volta</button></div>' : '') +
    '</div>';
}
function mkcReturnable(i) { return ['aguardando', 'sugestao', 'aprovada', 'recusada', 'a_venda'].indexOf(i.status) >= 0; }

function mkcItemRowUser(i, c) {
  const pct = Number(c.commission_pct);
  const net = i.asking_price * i.qty * (1 - pct / 100);
  let extra = '';
  if (i.status === 'sugestao') {
    extra = '<div class="mkc-sug">A loja sugere <b>' + mkMoney(i.suggested_price) + '</b>' + (i.review_note ? ' — “' + mkEsc(i.review_note) + '”' : '') +
      '<div class="mkc-btns"><button type="button" class="btn-mini mk-primary" onclick="mkcAnswer(' + i.id + ',true)">Aceitar ' + mkMoney(i.suggested_price) + '</button>' +
      '<button type="button" class="btn-mini" onclick="mkcAnswer(' + i.id + ',false)">Não aceito</button></div></div>';
  } else if (i.status === 'recusada' && i.review_note) {
    extra = '<div class="mkc-sug mkc-bad">Motivo: ' + mkEsc(i.review_note) + '</div>';
  }
  const liveEditable = ['aguardando', 'sugestao', 'aprovada', 'a_venda'].indexOf(i.status) >= 0;
  return '<div class="mkc-item"><div class="mkc-item-main">' + mkcItemLine(i) + extra + '</div>' +
    '<div class="mkc-item-side"><span class="mkc-ist mkc-ist-' + i.status + '">' + MKC_IST[i.status] + '</span>' +
    '<div>' + i.qty + '× ' + mkMoney(i.asking_price) + (i.qty_sold ? ' <span class="mk-hint">(' + i.qty_sold + ' vendida(s))</span>' : '') + '</div>' +
    (i.status === 'vendida' || i.qty_sold ? '<div class="mk-hint">Vendido: ' + mkMoney(i.sold_total) + '</div>' : '<div class="mk-hint">Você recebe ~' + mkMoney(net) + '</div>') +
    '<div class="mk-hint">' + (i.live_auction ? '🎥 Leilão ao vivo ≥ ' + mkMoney(i.live_min_price) : 'Sem leilão ao vivo') +
      (liveEditable ? ' · <button type="button" class="mkc-link" onclick="mkcEditLive(' + i.id + ')">alterar</button>' : '') + '</div></div></div>';
}

function mkcReturnRowUser(r) {
  const its = mkc.items.filter(function (i) { return i.return_id === r.id; }).map(function (i) { return i.qty + '× ' + mkEsc(i.name); }).join(', ');
  let act = '';
  if (r.status === 'frete_informado') {
    const url = mkcSellerWaUrl('Oi! Sobre a devolução #' + r.id + ' da consignação #' + r.consignment_id + ' no MyDeck: quero pagar o frete de ' + mkMoney(r.freight_amount) + '.');
    act = (url ? '<a class="btn-mini mk-primary" target="_blank" rel="noopener" href="' + mkEsc(url) + '">💬 Combinar o pagamento no WhatsApp</a>' : '');
  }
  if (r.status === 'pedida' || r.status === 'frete_informado') act += '<button type="button" class="btn-mini" onclick="mkcReturnCancel(' + r.id + ')">Cancelar devolução</button>';
  return '<div class="mkc-ret"><b>Devolução #' + r.id + '</b> <span class="mkc-st mkc-st-' + r.status + '">' + MKC_RST[r.status] + '</span>' +
    '<div class="mk-hint">' + its + '</div>' +
    (r.freight_amount != null ? '<div>Frete de volta: <b>' + mkMoney(r.freight_amount) + '</b>' + (r.freight_note ? ' <span class="mk-hint">(' + mkEsc(r.freight_note) + ')</span>' : '') + '</div>' : '') +
    (r.tracking_code ? '<div>Rastreio: <b>' + mkEsc(r.tracking_code) + '</b>' + (r.carrier ? ' (' + mkEsc(r.carrier) + ')' : '') + '</div>' : '') +
    (act ? '<div class="mkc-btns">' + act + '</div>' : '') + '</div>';
}

// ── ações do dono ───────────────────────────────────────────────────
async function mkcRpcUser(name, args, okMsg) {
  const { error } = await sbClient.rpc(name, args);
  if (error) { mkToast(mkcErr(error), true); return false; }
  if (okMsg) mkToast(okMsg);
  await mkcLoadUser(true); mkcRenderUser();
  return true;
}
function mkcShowTerm() {
  if (!mkc.term) return;
  mkOpenModal('<h3>' + mkEsc(mkc.term.title) + ' <span class="mk-hint">v' + mkc.term.version + '</span></h3>' +
    (mkc.term.draft ? '<div class="mkc-warn">⚠️ Rascunho em revisão jurídica.</div>' : '') + '<div class="mk-md mkc-term">' + mkcTermHtml() + '</div>', { wide: true });
}
async function mkcSaveTracking(id) {
  const car = document.getElementById('mkc-car-' + id).value, trk = document.getElementById('mkc-trk-' + id).value;
  await mkcRpcUser('mk_consign_update_tracking', { p_id: id, p_carrier: car, p_tracking: trk }, 'Rastreio salvo.');
}
async function mkcCancel(id) {
  if (!confirm('Cancelar esta remessa? Só dá para cancelar antes de a loja receber as cartas.')) return;
  await mkcRpcUser('mk_consign_cancel', { p_id: id }, 'Remessa cancelada.');
}
async function mkcAnswer(itemId, ok) {
  await mkcRpcUser('mk_consign_answer', { p_item: itemId, p_accept: ok }, ok ? 'Preço aceito.' : 'Sugestão recusada. A carta fica disponível para devolução.');
}
function mkcEditLive(itemId) {
  const i = mkc.items.find(function (x) { return x.id === itemId; });
  if (!i) return;
  mkcAsk('Leilão ao vivo', 'Se aceitar, a carta pode ser leiloada na live da loja, sem sair abaixo do lance mínimo. Carta já anunciada numa live agendada não sai dela.', [
    { id: 'live', label: 'Aceito leilão ao vivo', type: 'checkbox', value: i.live_auction },
    { id: 'min', label: 'Lance mínimo (R$)', value: i.live_min_price != null ? mkMoneyInput(i.live_min_price) : '', attrs: 'inputmode="decimal"' },
  ], 'Salvar', async function (v) {
    const min = mkParseMoney(v.min);
    if (v.live && (min == null || !(min > 0))) return 'Informe o lance mínimo.';
    const { error } = await sbClient.rpc('mk_consign_set_live', { p_item: itemId, p_live: !!v.live, p_min: v.live ? min : null });
    if (error) return mkcErr(error);
    mkToast('Opção salva.'); await mkcLoadUser(true); mkcRenderUser();
  });
}

// ── pedir cartas de volta (dono ou equipe) ──────────────────────────
function mkcOpenReturn(cid, byStore) {
  const list = byStore ? mkc.panel.items : mkc.items;
  const items = list.filter(function (i) { return i.consignment_id === cid && mkcReturnable(i); });
  if (!items.length) { mkToast('Não há cartas que possam ser devolvidas agora.', true); return; }
  mkOpenModal('<div class="mk-form"><h3>📮 Pedir as cartas de volta</h3>' +
    '<div class="mk-hint">Marque as cartas. Cartas já vendidas ou reservadas para um comprador não saem. ' +
    (byStore ? 'O dono receberá o valor do frete para pagar antes do envio.' : '<b>O frete de volta é por sua conta e é pago antes do envio:</b> a loja informa o valor e envia assim que o pagamento for confirmado.') + '</div>' +
    '<div class="mkc-pick">' + items.map(function (i) {
      return '<label class="mkc-pick-i"><input type="checkbox" class="mkc-ret-chk" value="' + i.id + '"' + (byStore && i.status !== 'recusada' ? '' : ' checked') + '> ' + mkcItemLine(i) + ' <span class="mk-hint">' + i.qty + '×</span></label>';
    }).join('') + '</div>' +
    '<label class="mk-f"><span>Endereço completo para entrega *</span><textarea id="mkc-ret-addr" rows="3" maxlength="400" placeholder="Rua, número, complemento, bairro, cidade/UF, CEP"></textarea></label>' +
    '<div id="mkc-ret-err" class="mk-form-err"></div>' +
    '<div class="mk-form-actions"><button type="button" class="btn-mini" onclick="mkCloseModal()">Voltar</button>' +
    '<button type="button" class="btn-mini mk-primary" onclick="mkcSubmitReturn(' + cid + ',' + (byStore ? 'true' : 'false') + ')">Pedir devolução</button></div></div>');
}
async function mkcSubmitReturn(cid, byStore) {
  const ids = Array.prototype.map.call(document.querySelectorAll('.mkc-ret-chk:checked'), function (e) { return Number(e.value); });
  const addr = document.getElementById('mkc-ret-addr').value.trim(), err = document.getElementById('mkc-ret-err');
  if (!ids.length) { err.textContent = 'Marque pelo menos uma carta.'; return; }
  if (addr.length < 10) { err.textContent = 'Informe o endereço completo.'; return; }
  const { error } = await sbClient.rpc('mk_consign_return_request', { p_consignment: cid, p_items: ids, p_address: addr });
  if (error) { err.textContent = mkcErr(error); return; }
  mkCloseModal(); mkToast('Devolução pedida. A loja vai informar o valor do frete.');
  if (byStore) mkcRenderPanel(true); else { await mkcLoadUser(true); mkcRenderUser(); }
}
async function mkcReturnCancel(id) {
  if (!confirm('Cancelar esta devolução? As cartas voltam ao estado anterior.')) return;
  const { error } = await sbClient.rpc('mk_consign_return_cancel', { p_return: id });
  if (error) { mkToast(mkcErr(error), true); return; }
  mkToast('Devolução cancelada.');
  if (mk.view === 'panel' && mk.panelTab === 'consignacao') mkcRenderPanel(true); else { await mkcLoadUser(true); mkcRenderUser(); }
}

// ── modal de pergunta simples (usado pelo dono e pela equipe) ───────
function mkcAsk(title, intro, fields, okLabel, cb) {
  mkOpenModal('<div class="mk-form"><h3>' + mkEsc(title) + '</h3>' + (intro ? '<div class="mk-hint" style="margin-bottom:8px">' + intro + '</div>' : '') +
    fields.map(function (f) {
      if (f.type === 'checkbox') return '<label class="mk-check"><input type="checkbox" id="mkca-' + f.id + '"' + (f.value ? ' checked' : '') + '> ' + mkEsc(f.label) + '</label>';
      return '<label class="mk-f"><span>' + mkEsc(f.label) + '</span>' + (f.type === 'textarea'
        ? '<textarea id="mkca-' + f.id + '" rows="3" maxlength="300">' + mkEsc(f.value || '') + '</textarea>'
        : '<input id="mkca-' + f.id + '" value="' + mkEsc(f.value == null ? '' : f.value) + '" ' + (f.attrs || '') + '>') + '</label>';
    }).join('') +
    '<div id="mkca-err" class="mk-form-err"></div>' +
    '<div class="mk-form-actions"><button type="button" class="btn-mini" onclick="mkCloseModal()">Cancelar</button><button type="button" class="btn-mini mk-primary" id="mkca-ok">' + mkEsc(okLabel) + '</button></div></div>');
  const ok = document.getElementById('mkca-ok');
  ok.onclick = async function () {
    const v = {};
    fields.forEach(function (f) { const el = document.getElementById('mkca-' + f.id); v[f.id] = f.type === 'checkbox' ? el.checked : el.value.trim(); });
    ok.disabled = true;
    const msg = await cb(v);
    if (msg) { document.getElementById('mkca-err').textContent = msg; ok.disabled = false; } else mkCloseModal();
  };
}

// ── formulário de nova remessa ──────────────────────────────────────
function mkcBlankRow() { return { name: '', set_id: '', set_label: '', card_n: '', language: 'pt-BR', condition: 'NM', qty: 1, price: '', live: false, livemin: '', ref: null }; }
function mkcOpenForm() {
  if (!(typeof uid === 'function' && uid())) { if (typeof _showAuth === 'function') _showAuth(true); return; }
  if (!mkc.seller || !mkc.term) return;
  mkc.form = { rows: [mkcBlankRow()], name: '', doc: '', phone: '', pix: '', carrier: '', tracking: '', accept: false };
  mkcRenderForm();
}
function mkcFormSync() {
  const f = mkc.form;
  if (!f) return;
  document.querySelectorAll('.mkc-row').forEach(function (el, i) {
    const r = f.rows[i];
    if (!r) return;
    el.querySelectorAll('[data-f]').forEach(function (inp) { r[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value; });
  });
  ['name', 'doc', 'phone', 'pix', 'carrier', 'tracking'].forEach(function (k) { const e = document.getElementById('mkc-f-' + k); if (e) f[k] = e.value; });
  const a = document.getElementById('mkc-f-accept'); if (a) f.accept = a.checked;
}
function mkcRowHtml(r, i, n) {
  const opt = function (list, cur) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); };
  const inp = function (f, ph, extra) { return '<input data-f="' + f + '" placeholder="' + ph + '" value="' + mkEsc(r[f]) + '" ' + (extra || '') + '>'; };
  return '<div class="mkc-row"><div class="mkc-row-h"><b>Carta ' + (i + 1) + '</b>' + (n > 1 ? '<button type="button" class="mkc-link" onclick="mkcRowDel(' + i + ')">remover</button>' : '') + '</div>' +
    '<input data-f="name" placeholder="Nome ou código da carta * (ex.: charizard ex, sv3 125, obf 125)" value="' + mkEsc(r.name) + '" maxlength="120" autocomplete="off" oninput="mkcSearch(' + i + ',this.value)">' +
    '<div class="mkc-res" id="mkc-res-' + i + '"></div>' +
    '<div class="mkc-g2">' + inp('set_label', 'Coleção (ex.: Chamas Obsidianas)', 'maxlength="80"') + inp('card_n', 'Nº (ex.: 125/197)', 'maxlength="20"') + '</div>' +
    '<div class="mkc-g4"><select data-f="language">' + opt([['pt-BR', '🇧🇷 Português'], ['en', '🇺🇸 Inglês'], ['ja', '🇯🇵 Japonês'], ['zh', '🇨🇳 Chinês']], r.language) + '</select>' +
      '<select data-f="condition">' + opt([['M', 'Nova (M)'], ['NM', 'Quase nova (NM)'], ['MP', 'Usada (MP)'], ['HP', 'Muito usada (HP)'], ['D', 'Danificada (D)']], r.condition) + '</select>' +
      inp('qty', 'Qtd', 'type="number" min="1" max="99"') + inp('price', 'Preço un. R$ *', 'inputmode="decimal"') + '</div>' +
    (r.ref ? '<div class="mk-hint">Preço de referência no MyDeck: ' + mkMoney(r.ref) + ' (você decide o seu preço)</div>' : '') +
    '<label class="mkc-live"><input type="checkbox" data-f="live"' + (r.live ? ' checked' : '') + ' onchange="mkcFormSync();mkcRenderForm()"> 🎥 Aceito leilão ao vivo na live da loja</label>' +
    (r.live ? inp('livemin', 'Lance mínimo R$ *', 'inputmode="decimal"') : '') + '</div>';
}
function mkcRenderForm() {
  const f = mkc.form, s = mkc.seller;
  const keep = document.querySelector('.mk-modal-box');
  const scroll = keep ? keep.scrollTop : 0;
  const html = '<div class="mk-form"><h3>📦 Enviar cartas à ' + mkEsc(s.name) + '</h3>' +
    '<div class="mk-hint">Cadastre as cartas e o preço de cada uma. Depois de enviar o formulário, você recebe o endereço para postar. Comissão da loja: <b>' + mkcPct(s.consign_commission_pct) + '%</b> sobre o que for vendido.</div>' +
    (mkc.term.draft ? '<div class="mkc-warn">⚠️ Termo em revisão jurídica (modo teste).</div>' : '') +
    '<div class="mkc-rows">' + f.rows.map(function (r, i) { return mkcRowHtml(r, i, f.rows.length); }).join('') + '</div>' +
    '<div class="mkc-btns"><button type="button" class="btn-mini" onclick="mkcRowAdd()">+ outra carta</button>' +
      '<button type="button" class="btn-mini" onclick="mkcImportListings()">⬇️ Importar das minhas cartas à venda</button></div>' +
    '<h4 class="mk-sub">Seus dados (para o repasse)</h4>' +
    '<div class="mkc-g2"><input id="mkc-f-name" placeholder="Nome completo *" maxlength="120" value="' + mkEsc(f.name) + '"><input id="mkc-f-doc" placeholder="CPF *" inputmode="numeric" maxlength="14" value="' + mkEsc(f.doc) + '"></div>' +
    '<div class="mkc-g2"><input id="mkc-f-phone" placeholder="Telefone / WhatsApp" inputmode="tel" maxlength="30" value="' + mkEsc(f.phone) + '"><input id="mkc-f-pix" placeholder="Chave Pix para receber *" maxlength="120" value="' + mkEsc(f.pix) + '"></div>' +
    '<h4 class="mk-sub">Envio (opcional agora)</h4>' +
    '<div class="mkc-g2"><input id="mkc-f-carrier" placeholder="Transportadora" maxlength="40" value="' + mkEsc(f.carrier) + '"><input id="mkc-f-tracking" placeholder="Código de rastreio" maxlength="60" value="' + mkEsc(f.tracking) + '"></div>' +
    '<h4 class="mk-sub">Termo de consignação (v' + mkc.term.version + ')</h4>' +
    '<div class="mk-md mkc-term mkc-term-box">' + mkcTermHtml() + '</div>' +
    '<label class="mk-check"><input type="checkbox" id="mkc-f-accept"' + (f.accept ? ' checked' : '') + '> Li e aceito o termo de consignação. Sei que, depois de a loja receber as cartas, a guarda é dela, e que o frete de devolução é por minha conta.</label>' +
    '<div id="mkc-f-err" class="mk-form-err"></div>' +
    '<div class="mk-form-actions"><button type="button" class="btn-mini" onclick="mkcFormClose()">Cancelar</button><button type="button" class="btn-mini mk-primary" id="mkc-f-ok" onclick="mkcSubmit()">Enviar remessa</button></div></div>';
  mkOpenModal(html, { wide: true, sticky: true });
  const box = document.querySelector('.mk-modal-box'); if (box) box.scrollTop = scroll;
}
function mkcFormClose() { mkc.form = null; mkCloseModal(); }
function mkcRowAdd() { mkcFormSync(); if (mkc.form.rows.length >= 100) return; mkc.form.rows.push(mkcBlankRow()); mkcRenderForm(); }
function mkcRowDel(i) { mkcFormSync(); mkc.form.rows.splice(i, 1); if (!mkc.form.rows.length) mkc.form.rows.push(mkcBlankRow()); mkcRenderForm(); }
function mkcImportListings() {
  mkcFormSync();
  const list = (typeof cardListings !== 'undefined' && Array.isArray(cardListings)) ? cardListings : [];
  if (!list.length) { mkToast('Você ainda não tem cartas na lista “À Venda”.', true); return; }
  const rows = list.slice(0, 100).map(function (l) {
    return { name: l.card_name || '', set_id: l.set_id || '', ref: null, set_label: typeof cvSetLbl === 'function' ? cvSetLbl(l.set_id) : '', card_n: l.card_n || '', language: l.language || 'pt-BR',
      condition: ['M', 'NM', 'MP', 'HP', 'D'].indexOf(l.condition) >= 0 ? l.condition : 'NM', qty: Math.min(99, Math.max(1, Number(l.qty) || 1)),
      price: l.price != null ? mkMoneyInput(l.price) : '', live: false, livemin: '' };
  });
  const f = mkc.form;
  f.rows = f.rows.filter(function (r) { return r.name.trim() || r.price; }).concat(rows).slice(0, 100);
  mkcRenderForm();
  mkToast(rows.length + ' carta(s) importada(s). Confira os preços.');
}
async function mkcSubmit() {
  mkcFormSync();
  const f = mkc.form, err = document.getElementById('mkc-f-err'), btn = document.getElementById('mkc-f-ok');
  const fail = function (m) { err.textContent = m; };
  const items = [];
  for (let i = 0; i < f.rows.length; i++) {
    const r = f.rows[i], n = 'Carta ' + (i + 1) + ': ';
    if (!r.name.trim()) return fail(n + 'informe o nome.');
    const price = mkParseMoney(r.price);
    if (price == null || !(price > 0) || price > 100000) return fail(n + 'informe o preço (em R$).');
    const qty = parseInt(r.qty, 10);
    if (!(qty >= 1 && qty <= 99)) return fail(n + 'quantidade entre 1 e 99.');
    let min = null;
    if (r.live) { min = mkParseMoney(r.livemin); if (min == null || !(min > 0)) return fail(n + 'informe o lance mínimo do leilão.'); }
    items.push({ name: r.name.trim(), set_id: r.set_id || '', set_label: r.set_label.trim(), card_n: r.card_n.trim(), language: r.language, condition: r.condition, qty: qty, asking_price: price, live_auction: !!r.live, live_min_price: min });
  }
  if (f.name.trim().length < 5) return fail('Informe seu nome completo.');
  if (String(f.doc).replace(/\D/g, '').length !== 11) return fail('Informe um CPF válido (11 números).');
  if (f.pix.trim().length < 5) return fail('Informe a chave Pix para o repasse.');
  if (!f.accept) return fail('Marque que leu e aceita o termo.');
  err.textContent = ''; btn.disabled = true;
  const { error } = await sbClient.rpc('mk_consign_create', {
    p_seller: mkc.seller.id, p_items: items, p_term_version: mkc.term.version, p_accept: true,
    p_name: f.name.trim(), p_doc: f.doc, p_phone: f.phone.trim(), p_pix: f.pix.trim(), p_carrier: f.carrier.trim(), p_tracking: f.tracking.trim(),
  });
  btn.disabled = false;
  if (error) return fail(mkcErr(error));
  mkc.form = null; mkCloseModal();
  mkToast('Remessa registrada! Veja abaixo o endereço para enviar.');
  await mkcLoadUser(true); mkcRenderUser();
}

// ── busca de carta no catálogo do MyDeck (nome ou código) e preenchimento automático ──────────
// Aceita nome ("charizard ex"), coleção + número ("sv3 125", "obf 125", "sv3-125") e número impresso ("125/230").
function mkcNorm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function mkcSetKey(t) { return mkcNorm(t).replace(/\./g, 'pt'); }   // "SV3.5" = "sv3pt5"
function mkcBuildIndex() {
  if (typeof getAllCatalogCards !== 'function' || typeof SET_CATALOG === 'undefined') return null;
  const all = getAllCatalogCards();
  if (mkc.idx && mkc.idx.n === all.length) return mkc.idx;
  const meta = {}, keys = {};
  SET_CATALOG.forEach(function (s, order) {
    const m = /^([^—(]+?)\s*(?:\(([^)]+)\))?\s*—\s*(.+)$/.exec(s.label || '');
    const short = m ? m[1].trim() : String(s.id).toUpperCase(), code = m && m[2] ? m[2] : '', name = m ? m[3].trim() : (s.label || s.id);
    meta[s.id] = { id: s.id, short: short, code: code, name: name, series: s.series, order: order };
    [s.id, short, code].forEach(function (k) { if (k) keys[mkcSetKey(k)] = keys[mkcSetKey(k)] || s.id; });
  });
  const rows = all.map(function (c) { const n = parseInt(c.n, 10); return { c: c, nm: mkcNorm(c.name), num: Number.isFinite(n) ? n : null, set: c._setId }; });
  mkc.idx = { n: all.length, meta: meta, keys: keys, rows: rows };
  return mkc.idx;
}
function mkcFindCards(q) {
  q = String(q || '').trim();
  if (q.length < 2) return { cards: [], msg: '' };
  if (typeof _lazySetsLoaded !== 'undefined' && !_lazySetsLoaded && typeof loadLazySets === 'function') { loadLazySets(); return { cards: [], msg: 'Carregando o catálogo… digite de novo em instantes.' }; }
  const ix = mkcBuildIndex();
  if (!ix) return { cards: [], msg: '' };
  const toks = mkcNorm(q).replace(/[\/\\_,]+/g, ' ').replace(/\s*-\s*/g, ' ').split(/\s+/).filter(Boolean);
  let setId = null, num = null; const words = [];
  toks.forEach(function (t) {
    const k = t.replace(/\./g, 'pt');
    if (/^\d{1,4}$/.test(t)) { if (num == null) num = parseInt(t, 10); }   // o 2º número ("125/230") é o total da coleção: ignora
    else if (!setId && k.length >= 3 && !/^(vmax|vstar|gx|tag|team|ex)$/.test(k) && ix.keys[k]) setId = ix.keys[k];   // 'ex', 'vmax'... são nome de carta, não coleção
    else words.push(t);
  });
  const hasWords = words.length > 0;
  if (!hasWords && !(setId && num != null)) return { cards: [], msg: '' };
  const out = [];
  for (let i = 0; i < ix.rows.length; i++) {
    const r = ix.rows[i];
    if (setId && r.set !== setId) continue;
    if (num != null && r.num !== num) continue;
    let ok = true;
    for (let w = 0; w < words.length; w++) if (r.nm.indexOf(words[w]) < 0) { ok = false; break; }
    if (!ok) continue;
    const exact = hasWords && r.nm === words.join(' ') ? 0 : (hasWords && r.nm.indexOf(words[0]) === 0 ? 1 : 2);
    out.push({ r: r, score: exact * 1000 + (ix.meta[r.set] ? ix.meta[r.set].order : 500) });
  }
  out.sort(function (a, b) { return a.score - b.score; });
  const cards = out.slice(0, 8).map(function (x) { return x.r.c; });
  return { cards: cards, msg: cards.length ? '' : 'Nenhuma carta encontrada. Preencha à mão.' };
}
function mkcSearch(i, val) {
  const box = document.getElementById('mkc-res-' + i);
  if (!box) return;
  const res = mkcFindCards(val), ix = mkc.idx;
  mkc.res[i] = res.cards;
  box.innerHTML = res.msg ? '<div class="mk-hint" style="padding:6px 8px">' + mkEsc(res.msg) + '</div>' : res.cards.map(function (c, k) {
    const m = ix.meta[c._setId] || { name: c._setId, code: '', short: String(c._setId).toUpperCase() };
    let img = '';
    try { img = typeof imgThumb === 'function' && typeof getBinderImg === 'function' ? imgThumb(getBinderImg(c, c._setId)) : ''; } catch (e) { img = ''; }
    return '<button type="button" class="mkc-res-i" onclick="mkcPick(' + i + ',' + k + ')">' +
      (img ? '<img src="' + mkEsc(img) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '<span class="mkc-res-ph">🃏</span>') +
      '<span class="mkc-res-t"><b>' + mkEsc(c.name) + '</b><small>' + mkEsc(m.name) + ' · ' + mkEsc(m.code || m.short) + ' #' + mkEsc(c.n) + (c.rare ? ' · ' + mkEsc(c.rare) : '') + '</small></span>' +
      (c.price > 0 ? '<span class="mkc-res-p">' + mkMoney(c.price) + '</span>' : '') + '</button>';
  }).join('');
}
function mkcSetLang(id, series) { return /jp$/.test(id) ? 'ja' : /cn$/.test(id) ? 'zh' : (series === 'SV' || series === 'ME') ? 'pt-BR' : 'en'; }
function mkcPick(i, k) {
  mkcFormSync();
  const c = mkc.res[i] && mkc.res[i][k], r = mkc.form && mkc.form.rows[i];
  if (!c || !r) return;
  const m = (mkc.idx && mkc.idx.meta[c._setId]) || { name: c._setId, code: '', short: '', series: '' };
  r.name = c.name; r.set_id = c._setId; r.set_label = (m.name + (m.code || m.short ? ' (' + (m.code || m.short) + ')' : '')).slice(0, 80);
  r.card_n = String(c.n).slice(0, 20); r.language = mkcSetLang(c._setId, m.series);
  r.ref = c.price > 0 ? c.price : null;
  if (!String(r.price).trim() && r.ref) r.price = mkMoneyInput(r.ref);
  mkc.res = {};
  mkcRenderForm();
  const row = document.querySelectorAll('.mkc-row')[i];
  const pr = row && row.querySelector('[data-f=price]'); if (pr) { pr.focus(); pr.select(); }
}

// quando abrir a aba Compra/Venda, desenha a seção
(function () {
  const orig = window.renderCartas;
  if (typeof orig === 'function') {
    window.renderCartas = function () { const r = orig.apply(this, arguments); try { mkcRenderUser(); } catch (e) { console.error('[mkc]', e); } return r; };
  }
})();

// link discreto na vitrine ("quer vender suas cartas pela loja?")
function mkcStoreLinkHtml() {
  const s = mk && mk.seller;
  if (!s || !s.consign_enabled) return '';
  return '<div class="mkc-store-link">💱 Tem cartas para vender? <button type="button" class="mkc-link" onclick="goToTab(\'cartas\')">Venda pela ' + mkEsc(s.name) + ' em consignação</button></div>';
}

// ══════════════════ EQUIPE DA LOJA (aba do painel) ══════════════════
async function mkcRenderPanel(force) {
  const body = document.getElementById('mk-panel-body');
  if (!body) return;
  const P = mkc.panel;
  if (!P.loaded || force) {
    if (!P.loaded) body.innerHTML = '<div class="mk-empty">Carregando consignação…</div>';
    const sid = mk.seller.id;
    const [c, i, r, p, t] = await Promise.all([
      sbClient.from('mk_consignments').select('*').eq('seller_id', sid).order('created_at', { ascending: false }).limit(200),
      sbClient.from('mk_consign_items').select('*').eq('seller_id', sid).order('id', { ascending: false }).limit(1000),
      sbClient.from('mk_consign_returns').select('*').eq('seller_id', sid).order('id', { ascending: false }).limit(200),
      sbClient.from('mk_seller_private').select('*').eq('seller_id', sid).maybeSingle(),
      sbClient.from('mk_consign_terms').select('*').order('version', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (c.error) { body.innerHTML = '<div class="mk-empty">Não consegui carregar: ' + mkEsc(c.error.message) + '</div>'; return; }
    P.consignments = c.data || []; P.items = i.data || []; P.returns = r.data || []; P.priv = p.data || null; P.loaded = true;
    mkc.seller = mk.seller; mkc.term = t.data || mkc.term;
  }
  if (mk.panelTab !== 'consignacao') return;
  const open = P.consignments.filter(function (x) { return x.status === 'enviada' || x.status === 'recebida'; });
  const done = P.consignments.filter(function (x) { return !(x.status === 'enviada' || x.status === 'recebida'); });
  const list = P.filter === 'andamento' ? open : done;
  const s = mk.seller;
  const missing = [];
  if (!(s.legal_name || '').trim() || !(s.cnpj || '').trim()) missing.push('razão social e CNPJ/CPF (aba Dados da loja)');
  if (!P.priv || (P.priv.consign_address || '').trim().length < 10) missing.push('endereço para receber as cartas (abaixo)');
  body.innerHTML = '<div class="mkc-card"><b>Consignação</b> <span class="mkc-st mkc-st-' + (s.consign_enabled ? 'recebida' : 'cancelada') + '">' + (s.consign_enabled ? 'Liberada ao público' : 'Desligada (só o admin do MyDeck vê)') + '</span>' +
    '<div class="mk-hint" style="margin-top:6px">Regras: você tem 30 dias após o recebimento para analisar; comissão de ' + mkcPct(s.consign_commission_pct) + '%; repasse por Pix em até 7 dias úteis depois da entrega ao comprador; devolução só com o frete pago pelo dono. O liga/desliga e a comissão ficam com o admin do MyDeck.' +
    ' <button type="button" class="mkc-link" onclick="mkcShowTerm()">Ver o termo</button></div>' +
    (missing.length ? '<div class="mkc-warn">Para a consignação funcionar falta cadastrar: ' + missing.join(' e ') + '.</div>' : '') +
    '<details class="mkc-addr"' + (P.priv && P.priv.consign_address ? '' : ' open') + '><summary>📍 Endereço para receber as cartas (só quem registra remessa vê)</summary>' +
    '<label class="mk-f"><span>Nome de quem recebe</span><input id="mkc-recv" maxlength="120" value="' + mkEsc((P.priv && P.priv.consign_receiver) || '') + '"></label>' +
    '<label class="mk-f"><span>Endereço completo com CEP</span><textarea id="mkc-addr" rows="3" maxlength="400">' + mkEsc((P.priv && P.priv.consign_address) || '') + '</textarea></label>' +
    '<button type="button" class="btn-mini mk-primary" onclick="mkcSaveAddr()">💾 Salvar endereço</button></details></div>' +
    '<div class="mk-chips" style="margin:10px 0"><button type="button" class="filter-chip' + (P.filter === 'andamento' ? ' filter-chip-active' : '') + '" onclick="mkcPanelFilter(\'andamento\')">Em andamento (' + open.length + ')</button>' +
    '<button type="button" class="filter-chip' + (P.filter === 'encerradas' ? ' filter-chip-active' : '') + '" onclick="mkcPanelFilter(\'encerradas\')">Encerradas (' + done.length + ')</button></div>' +
    (list.length ? '<div class="mkc-list">' + list.map(mkcConsignmentCardStore).join('') + '</div>' : '<div class="mk-empty">Nenhuma remessa ' + (P.filter === 'andamento' ? 'em andamento' : 'encerrada') + '.</div>');
}
function mkcPanelFilter(f) { mkc.panel.filter = f; mkcRenderPanel(false); }
async function mkcSaveAddr() {
  const recv = document.getElementById('mkc-recv').value.trim(), addr = document.getElementById('mkc-addr').value.trim();
  if (addr.length < 10) { mkToast('Informe o endereço completo.', true); return; }
  const { error } = await sbClient.from('mk_seller_private').upsert({ seller_id: mk.seller.id, consign_receiver: recv || null, consign_address: addr, updated_at: new Date().toISOString() }, { onConflict: 'seller_id' });
  if (error) { mkToast(mkcErr(error), true); return; }
  mkToast('Endereço salvo.'); mkcRenderPanel(true);
}

function mkcConsignmentCardStore(c) {
  const P = mkc.panel;
  const items = P.items.filter(function (i) { return i.consignment_id === c.id; });
  const rets = P.returns.filter(function (r) { return r.consignment_id === c.id; });
  const waiting = items.filter(function (i) { return i.status === 'aguardando'; }).length;
  const late = c.status === 'recebida' && waiting && Date.parse(c.review_deadline) < Date.now();
  const wa = mkDigits(c.phone);
  let top = '';
  if (c.status === 'enviada') {
    top = '<div class="mkc-note">' + (c.tracking_code ? 'Rastreio: <b>' + mkEsc(c.tracking_code) + '</b>' + (c.carrier ? ' (' + mkEsc(c.carrier) + ')' : '') + '. ' : 'O dono ainda não informou rastreio. ') +
      'Quando a caixa chegar, confira e confirme — daí começam os 30 dias de análise e a guarda passa a ser da loja.' +
      '<div class="mkc-btns"><button type="button" class="btn-mini mk-primary" onclick="mkcReceive(' + c.id + ')">✅ Confirmar recebimento</button></div></div>';
  } else if (c.status === 'recebida') {
    top = '<div class="mkc-note">Recebida em ' + mkcDate(c.received_at) + '.' + (waiting ? ' <b>' + waiting + '</b> carta(s) para analisar até <b>' + mkcDate(c.review_deadline) + '</b>' + (late ? ' <span class="mkc-bad">(prazo vencido!)</span>' : '') + '.' : ' Análise concluída.') + '</div>';
  }
  const hasRefused = items.some(function (i) { return i.status === 'recusada'; });
  return '<div class="mkc-card"><div class="mkc-head"><b>Remessa #' + c.id + '</b><span class="mkc-st mkc-st-' + c.status + '">' + MKC_CST[c.status] + '</span><span class="mkc-when">' + mkcDate(c.created_at) + '</span></div>' +
    '<div class="mkc-owner"><b>' + mkEsc(c.accepted_name) + '</b> · CPF ' + mkEsc(mkcDoc(c.accepted_doc)) + ' · Pix: <b>' + mkEsc(c.pix_key) + '</b>' +
      (wa ? ' · <a target="_blank" rel="noopener" href="https://wa.me/' + (wa.length <= 11 ? '55' : '') + wa + '">💬 ' + mkEsc(c.phone) + '</a>' : '') +
      ' <span class="mk-hint">· comissão ' + mkcPct(c.commission_pct) + '% · termo v' + c.term_version + ' aceito em ' + mkcDate(c.accepted_at) + '</span></div>' + top +
    '<div class="mkc-items">' + items.map(function (i) { return mkcItemRowStore(i, c); }).join('') + '</div>' +
    (rets.length ? '<div class="mkc-rets">' + rets.map(mkcReturnRowStore).join('') + '</div>' : '') +
    (c.status === 'recebida' && hasRefused ? '<div class="mkc-foot"><button type="button" class="btn-mini" onclick="mkcOpenReturn(' + c.id + ',true)">📮 Abrir devolução das cartas recusadas</button></div>' : '') +
    '</div>';
}

function mkcItemRowStore(i, c) {
  let act = '';
  if (c.status === 'recebida' && (i.status === 'aguardando' || i.status === 'sugestao')) {
    act = '<button type="button" class="btn-mini mk-primary" onclick="mkcReview(' + i.id + ',\'aprovar\')">Aprovar</button>' +
      '<button type="button" class="btn-mini" onclick="mkcReviewAsk(' + i.id + ',\'sugerir\')">Sugerir preço</button>' +
      '<button type="button" class="btn-mini btn-mini-danger" onclick="mkcReviewAsk(' + i.id + ',\'recusar\')">Recusar</button>';
  } else if (i.status === 'aprovada') {
    act = '<button type="button" class="btn-mini mk-primary" onclick="mkcPublish(' + i.id + ')">Publicar na vitrine</button>';
  } else if (i.status === 'a_venda') {
    const p = mk.products.find(function (x) { return x.id === i.product_id; });
    act = '<button type="button" class="btn-mini mk-primary" onclick="mkcSoldAsk(' + i.id + ')">Marcar vendida</button>' +
      (p ? '<button type="button" class="btn-mini" onclick="mkcOpenProduct(' + p.id + ')">Abrir produto' + (p.status === 'rascunho' ? ' (rascunho — falta ativar)' : '') + '</button>' : '');
  }
  return '<div class="mkc-item"><div class="mkc-item-main">' + mkcItemLine(i) +
    (i.status === 'sugestao' ? '<div class="mkc-sug">Sugestão enviada: ' + mkMoney(i.suggested_price) + ' — aguardando o dono.</div>' : '') +
    (i.review_note ? '<div class="mk-hint">Nota: ' + mkEsc(i.review_note) + '</div>' : '') + '</div>' +
    '<div class="mkc-item-side"><span class="mkc-ist mkc-ist-' + i.status + '">' + MKC_IST[i.status] + '</span>' +
    '<div>' + i.qty + '× ' + mkMoney(i.asking_price) + (i.qty_sold ? ' <span class="mk-hint">(' + i.qty_sold + ' vendida(s) · ' + mkMoney(i.sold_total) + ')</span>' : '') + '</div>' +
    '<div class="mk-hint">' + (i.live_auction ? '🎥 Leilão ao vivo ≥ ' + mkMoney(i.live_min_price) : 'Sem leilão ao vivo') + '</div>' +
    (act ? '<div class="mkc-btns">' + act + '</div>' : '') + '</div></div>';
}

function mkcReturnRowStore(r) {
  const its = mkc.panel.items.filter(function (i) { return i.return_id === r.id; }).map(function (i) { return i.qty + '× ' + mkEsc(i.name); }).join(', ');
  let act = '';
  if (r.status === 'pedida' || r.status === 'frete_informado') act += '<button type="button" class="btn-mini mk-primary" onclick="mkcQuoteAsk(' + r.id + ')">' + (r.status === 'pedida' ? 'Informar frete' : 'Alterar frete') + '</button>';
  if (r.status === 'frete_informado') act += '<button type="button" class="btn-mini mk-primary" onclick="mkcReturnPaid(' + r.id + ')">💰 Frete pago</button>';
  if (r.status === 'frete_pago') act += '<button type="button" class="btn-mini mk-primary" onclick="mkcShipAsk(' + r.id + ')">📦 Marcar enviada</button>';
  if (r.status === 'pedida' || r.status === 'frete_informado') act += '<button type="button" class="btn-mini" onclick="mkcReturnCancel(' + r.id + ')">Cancelar</button>';
  return '<div class="mkc-ret"><b>Devolução #' + r.id + '</b> <span class="mkc-st mkc-st-' + r.status + '">' + MKC_RST[r.status].split(' — ')[0] + '</span>' +
    '<div class="mk-hint">' + its + '</div><div class="mk-hint">Entregar em: ' + mkEsc(r.address) + '</div>' +
    (r.freight_amount != null ? '<div>Frete: <b>' + mkMoney(r.freight_amount) + '</b>' + (r.freight_paid_at ? ' · pago em ' + mkcDate(r.freight_paid_at) : '') + '</div>' : '') +
    (r.tracking_code ? '<div>Rastreio: <b>' + mkEsc(r.tracking_code) + '</b></div>' : '') +
    (act ? '<div class="mkc-btns">' + act + '</div>' : '') + '</div>';
}

// ── ações da equipe ─────────────────────────────────────────────────
async function mkcRpcStore(name, args, okMsg, reloadProducts) {
  const { data, error } = await sbClient.rpc(name, args);
  if (error) { mkToast(mkcErr(error), true); return null; }
  if (okMsg) mkToast(okMsg);
  if (reloadProducts) await mkLoadAll(true);
  await mkcRenderPanel(true);
  return data === null || data === undefined ? true : data;
}
async function mkcReceive(id) {
  if (!confirm('Confirmar que a remessa #' + id + ' chegou? A partir daqui a guarda das cartas é da loja e começam os 30 dias de análise.')) return;
  await mkcRpcStore('mk_consign_receive', { p_id: id }, 'Recebimento confirmado. O dono foi avisado.');
}
async function mkcReview(itemId, action) { await mkcRpcStore('mk_consign_review', { p_item: itemId, p_action: action }, 'Carta aprovada.'); }
function mkcReviewAsk(itemId, action) {
  const sug = action === 'sugerir';
  mkcAsk(sug ? 'Sugerir outro preço' : 'Recusar carta', sug ? 'O dono precisa aceitar o novo preço.' : 'Explique o motivo; o dono verá.', sug
    ? [{ id: 'price', label: 'Preço sugerido (R$)', attrs: 'inputmode="decimal"' }, { id: 'note', label: 'Observação (opcional)', type: 'textarea' }]
    : [{ id: 'note', label: 'Motivo da recusa *', type: 'textarea' }], sug ? 'Enviar sugestão' : 'Recusar', async function (v) {
      const price = sug ? mkParseMoney(v.price) : null;
      if (sug && (price == null || !(price > 0))) return 'Informe o preço sugerido.';
      if (!sug && v.note.length < 3) return 'Informe o motivo.';
      const { error } = await sbClient.rpc('mk_consign_review', { p_item: itemId, p_action: action, p_price: price, p_note: v.note || null });
      if (error) return mkcErr(error);
      mkToast(sug ? 'Sugestão enviada ao dono.' : 'Carta recusada.'); mkcRenderPanel(true);
    });
}
async function mkcPublish(itemId) {
  const pid = await mkcRpcStore('mk_consign_publish', { p_item: itemId }, 'Publicada como rascunho. Adicione foto e ative em Produtos.', true);
  if (pid && pid !== true && confirm('Abrir o produto agora para colocar foto e ativar?')) mkcOpenProduct(pid);
}
function mkcOpenProduct(pid) {
  mkPanelTab('produtos');
  if (typeof mkOpenProductForm === 'function') mkOpenProductForm(pid);
}
function mkcSoldAsk(itemId) {
  const i = mkc.panel.items.find(function (x) { return x.id === itemId; });
  if (!i) return;
  mkcAsk('Marcar como vendida', 'Restam ' + (i.qty - i.qty_sold) + ' unidade(s). Informe quantas foram vendidas e o valor por unidade. O estoque da vitrine baixa e o dono é avisado.', [
    { id: 'qty', label: 'Quantidade vendida', value: i.qty - i.qty_sold, attrs: 'type="number" min="1" max="' + (i.qty - i.qty_sold) + '"' },
    { id: 'price', label: 'Valor por unidade (R$)', value: mkMoneyInput(i.asking_price), attrs: 'inputmode="decimal"' },
  ], 'Confirmar venda', async function (v) {
    const q = parseInt(v.qty, 10), p = mkParseMoney(v.price);
    if (!(q >= 1)) return 'Informe a quantidade.';
    if (p == null || !(p > 0)) return 'Informe o valor.';
    const { error } = await sbClient.rpc('mk_consign_mark_sold', { p_item: itemId, p_qty: q, p_unit_price: p });
    if (error) return mkcErr(error);
    mkToast('Venda registrada.'); await mkLoadAll(true); mkcRenderPanel(true);
  });
}
function mkcQuoteAsk(rid) {
  const r = mkc.panel.returns.find(function (x) { return x.id === rid; });
  mkcAsk('Frete da devolução', 'Calcule o frete de volta (PAC/Sedex) e informe. O dono é avisado e deve pagar antes do envio.', [
    { id: 'val', label: 'Valor do frete (R$)', value: r && r.freight_amount != null ? mkMoneyInput(r.freight_amount) : '', attrs: 'inputmode="decimal"' },
    { id: 'note', label: 'Observação (opcional)', value: (r && r.freight_note) || '' },
  ], 'Informar', async function (v) {
    const val = mkParseMoney(v.val);
    if (val == null || !(val >= 0)) return 'Informe o valor do frete.';
    const { error } = await sbClient.rpc('mk_consign_return_quote', { p_return: rid, p_freight: val, p_note: v.note || null });
    if (error) return mkcErr(error);
    mkToast('Frete informado ao dono.'); mkcRenderPanel(true);
  });
}
async function mkcReturnPaid(rid) {
  if (!confirm('Confirmar que o dono pagou o frete? O envio só é liberado depois disso.')) return;
  await mkcRpcStore('mk_consign_return_paid', { p_return: rid }, 'Pagamento confirmado.');
}
function mkcShipAsk(rid) {
  mkcAsk('Enviar de volta', 'Informe o rastreio. As cartas saem da vitrine e o dono é avisado.', [
    { id: 'car', label: 'Transportadora', value: 'Correios' }, { id: 'trk', label: 'Código de rastreio *' },
  ], 'Marcar enviada', async function (v) {
    if (v.trk.length < 4) return 'Informe o código de rastreio.';
    const { error } = await sbClient.rpc('mk_consign_return_ship', { p_return: rid, p_carrier: v.car, p_tracking: v.trk });
    if (error) return mkcErr(error);
    mkToast('Devolução enviada.'); await mkLoadAll(true); mkcRenderPanel(true);
  });
}

Object.assign(window, {
  mkcOpenForm, mkcSearch, mkcPick, mkcRowAdd, mkcRowDel, mkcFormSync, mkcRenderForm, mkcFormClose, mkcImportListings, mkcSubmit, mkcShowTerm, mkcSaveTracking, mkcCancel, mkcAnswer,
  mkcEditLive, mkcOpenReturn, mkcSubmitReturn, mkcReturnCancel, mkcRenderPanel, mkcPanelFilter, mkcSaveAddr, mkcReceive, mkcReview, mkcReviewAsk, mkcPublish,
  mkcOpenProduct, mkcSoldAsk, mkcQuoteAsk, mkcReturnPaid, mkcShipAsk, mkcRenderUser, mkcStoreLinkHtml,
});
