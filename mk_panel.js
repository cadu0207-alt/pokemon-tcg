// ================================================================
// MyDeck — Loja Toybox · painel do lojista (mk_panel.js) — 15/10/2026
// "Gerenciar loja": produtos (cadastro com fotos, preço, custo, quantidade), estoque (ajuste rápido + extrato),
// dados da loja e equipe. Só aparece pra quem é da loja (dono/gerente/estoque) ou admin — e o banco (RLS +
// mk_adjust_stock) é quem garante; esta tela só esconde o que a pessoa não pode usar.
// ================================================================

let mkForm = null;          // estado do formulário de produto aberto
let mkCatCache = null;      // catálogo de cartas (carregado 1x, só pra vincular carta ao produto)

function mkRenderPanel() {
  const wrap = document.getElementById('mk-wrap');
  if (!wrap || !mk.seller) return;
  const tabs = [['produtos', '📦 Produtos'], ['estoque', '🔢 Estoque'], ['pedidos', '🛒 Pedidos'], ['consignacao', '📥 Consignação'], ['config', '⚙️ Dados da loja']];
  if (mk.isOwner) { tabs.push(['pagamentos', '💳 Pagamentos']); tabs.push(['equipe', '👥 Equipe']); }
  if (!tabs.some(function (t) { return t[0] === mk.panelTab; })) mk.panelTab = 'produtos';
  wrap.innerHTML = '<div class="mk-page">' +
    '<div class="mk-panel-head"><div><div class="mk-panel-kicker">Painel do lojista</div><h2 class="mk-panel-title">' + mkEsc(mk.seller.name) + '</h2></div>' +
      '<button type="button" class="btn-mini" onclick="mkGoStore()">👁️ Ver a vitrine</button></div>' +
    '<div class="mk-tabs">' + tabs.map(function (t) {
      return '<button type="button" class="filter-chip' + (mk.panelTab === t[0] ? ' filter-chip-active' : '') + '" onclick="mkPanelTab(\'' + t[0] + '\')">' + t[1] + '</button>';
    }).join('') + '</div>' +
    '<div id="mk-panel-body"></div></div>';
  mkRenderPanelBody();
}
function mkPanelTab(t) { mk.panelTab = t; mkRenderPanel(); }
window.mkPanelTab = mkPanelTab;

function mkRenderPanelBody() {
  const body = document.getElementById('mk-panel-body');
  if (!body) return;
  if (mk.panelTab === 'produtos') body.innerHTML = mkProductsTabHtml();
  else if (mk.panelTab === 'estoque') body.innerHTML = mkStockTabHtml();
  else if (mk.panelTab === 'config') { body.innerHTML = mkConfigTabHtml(); }
  else if (mk.panelTab === 'consignacao') { body.innerHTML = '<div class="mk-empty">Carregando consignação…</div>'; mkcRenderPanel(false); }
  else if (mk.panelTab === 'pedidos') { body.innerHTML = '<div class="mk-empty">Carregando pedidos…</div>'; mkLoadSellerOrders(); }
  else if (mk.panelTab === 'pagamentos') {
    body.innerHTML = '<div class="mk-empty">Carregando…</div>';
    mkPaymentsTabHtml().then(function (h) { if (mk.panelTab === 'pagamentos') { const b = document.getElementById('mk-panel-body'); if (b) b.innerHTML = h; } });
  }
  else if (mk.panelTab === 'equipe') { body.innerHTML = '<div class="mk-empty">Carregando equipe…</div>'; mkLoadTeam(); }
}

// ══════════════════ PRODUTOS ══════════════════
function mkPanelList() {
  const f = mk.panelFilters;
  const q = f.q.trim().toLowerCase();
  return mk.products.filter(function (p) {
    if (f.status === 'todos' ? p.status === 'arquivado' : p.status !== f.status) return false;
    if (q && (p.title + ' ' + (p.sku || '')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}

function mkStockAlerts() {
  let out = 0, low = 0;
  mk.products.forEach(function (p) {
    if (p.status !== 'ativo') return;
    const q = mkQty(p);
    if (q <= 0) out++; else if (q <= (p.low_stock_alert || 0)) low++;
  });
  return { out: out, low: low };
}

function mkProductsTabHtml() {
  const f = mk.panelFilters;
  const al = mkStockAlerts();
  const list = mkPanelList();
  const opts = [['todos', 'Todos (menos arquivados)'], ['ativo', 'Ativos'], ['rascunho', 'Rascunhos'], ['pausado', 'Pausados'], ['arquivado', 'Arquivados']];
  return (al.out || al.low ? '<div class="mk-note mk-note-warn">' +
      (al.out ? '⛔ <b>' + al.out + '</b> produto' + (al.out > 1 ? 's' : '') + ' ativo' + (al.out > 1 ? 's' : '') + ' esgotado' + (al.out > 1 ? 's' : '') : '') +
      (al.out && al.low ? ' · ' : '') +
      (al.low ? '⚠️ <b>' + al.low + '</b> com estoque baixo' : '') +
      ' <a href="#" onclick="mkPanelTab(\'estoque\');return false;">ver estoque</a></div>' : '') +
    '<div class="mk-toolbar">' +
      '<button type="button" class="btn-mini mk-primary" onclick="mkOpenProductForm()">➕ Novo produto</button>' +
      '<input type="search" class="mk-search" placeholder="Buscar por nome ou código…" value="' + mkEsc(f.q) + '" oninput="mkPanelSearch(this.value)">' +
      '<select class="mk-select" onchange="mkPanelStatus(this.value)">' + opts.map(function (o) {
        return '<option value="' + o[0] + '"' + (f.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
    '</div>' +
    '<div id="mk-plist">' + mkProductRowsHtml(list) + '</div>';
}

function mkProductRowsHtml(list) {
  if (!list.length) {
    return '<div class="mk-empty">' + (mk.products.length ? 'Nenhum produto nesse filtro.' : 'Você ainda não cadastrou nenhum produto.<br>Comece por “➕ Novo produto”: nome, preço, quantidade e fotos.') + '</div>';
  }
  return '<div class="mk-rows">' + list.map(function (p) {
    const cover = mkSafeUrl(mkCover(p));
    const q = mkQty(p), r = mkReserved(p);
    const lowCls = q <= 0 ? ' out' : (q <= (p.low_stock_alert || 0) ? ' low' : '');
    const sub = [MK_KIND_LBL[p.kind] || p.kind];
    if (p.sku) sub.push('cód. ' + p.sku);
    const toggle = p.status === 'ativo'
      ? '<button type="button" class="btn-mini" title="Tirar da vitrine" onclick="mkSetProductStatus(' + p.id + ',\'pausado\')">⏸ Pausar</button>'
      : (p.status === 'arquivado'
        ? '<button type="button" class="btn-mini" onclick="mkSetProductStatus(' + p.id + ',\'rascunho\')">↩️ Restaurar</button>'
        : '<button type="button" class="btn-mini" title="Publicar na vitrine" onclick="mkSetProductStatus(' + p.id + ',\'ativo\')">▶ Publicar</button>');
    return '<div class="mk-row">' +
      '<div class="mk-row-img">' + (cover ? '<img loading="lazy" src="' + mkEsc(cover) + '" alt="">' : '<span>' + (MK_KIND_ICON[p.kind] || '🧸') + '</span>') + '</div>' +
      '<div class="mk-row-main"><div class="mk-row-title">' + mkEsc(p.title) + '</div><div class="mk-row-sub">' + mkEsc(sub.join(' · ')) + '</div></div>' +
      '<div class="mk-row-price">' + mkMoney(p.price) + '</div>' +
      '<div class="mk-row-stock' + lowCls + '"><b>' + q + '</b> em estoque' + (r ? '<br><small>' + r + ' reservado' + (r > 1 ? 's' : '') + '</small>' : '') + '</div>' +
      '<div><span class="mk-chip mk-chip-' + p.status + '">' + mkEsc(MK_STATUS_LBL[p.status] || p.status) + '</span></div>' +
      '<div class="mk-row-actions">' +
        '<button type="button" class="btn-mini" onclick="mkOpenProductForm(' + p.id + ')">✏️ Editar</button>' + toggle +
        '<button type="button" class="btn-mini' + (p.featured ? ' btn-mini-active' : '') + '" title="' + (p.featured ? 'Tirar o destaque' : 'Destacar nos banners') + '" onclick="mkToggleFeatured(' + p.id + ')">' + (p.featured ? '⭐' : '☆') + '</button>' +
        (p.status !== 'arquivado' ? '<button type="button" class="btn-mini btn-mini-danger" title="Arquivar (some da vitrine e da lista)" onclick="mkSetProductStatus(' + p.id + ',\'arquivado\')">🗄️</button>' : '') +
      '</div></div>';
  }).join('') + '</div>';
}

let mkPanelSearchTimer = null;
function mkPanelSearch(v) {
  mk.panelFilters.q = v;
  clearTimeout(mkPanelSearchTimer);
  mkPanelSearchTimer = setTimeout(function () {
    const h = document.getElementById('mk-plist');
    if (h) h.innerHTML = mkProductRowsHtml(mkPanelList());
  }, 150);
}
function mkPanelStatus(v) { mk.panelFilters.status = v; mkRenderPanelBody(); }
window.mkPanelSearch = mkPanelSearch; window.mkPanelStatus = mkPanelStatus;

async function mkToggleFeatured(id) {
  const p = mk.products.find(function (x) { return x.id === id; });
  if (!p) return;
  const { error } = await sbClient.from('mk_products').update({ featured: !p.featured }).eq('id', id);
  if (error) { mkToast('Não consegui mudar o destaque: ' + error.message, true); return; }
  p.featured = !p.featured;
  mkToast(p.featured ? 'Em destaque nos banners.' : 'Destaque removido.');
  mkRenderPanelBody();
}
window.mkToggleFeatured = mkToggleFeatured;

async function mkSetProductStatus(id, status) {
  const p = mk.products.find(function (x) { return x.id === id; });
  if (!p) return;
  if (status === 'arquivado' && !confirm('Arquivar "' + p.title + '"? Ele sai da vitrine e da lista (dá pra restaurar depois).')) return;
  if (status === 'ativo' && !(mkCover(p))) {
    if (!confirm('Este produto ainda não tem foto. Publicar mesmo assim?')) return;
  }
  const { error } = await sbClient.from('mk_products').update({ status: status }).eq('id', id);
  if (error) { mkToast('Não consegui mudar o status: ' + error.message, true); return; }
  p.status = status;
  mkToast(status === 'ativo' ? 'Publicado na vitrine.' : status === 'pausado' ? 'Tirado da vitrine.' : status === 'arquivado' ? 'Arquivado.' : 'Status atualizado.');
  mkRenderPanelBody();
}
window.mkSetProductStatus = mkSetProductStatus;

// ── formulário de produto ─────────────────────────────────────────────
function mkOpt(map, cur, emptyLabel) {
  return (emptyLabel ? '<option value="">' + emptyLabel + '</option>' : '') + Object.keys(map).map(function (k) {
    return '<option value="' + mkEsc(k) + '"' + (cur === k ? ' selected' : '') + '>' + mkEsc(map[k]) + '</option>';
  }).join('');
}

async function mkOpenProductForm(id) {
  let p = id ? mk.products.find(function (x) { return x.id === id; }) : null;
  if (id && !p) return;
  let cost = null;
  if (p) {
    const { data } = await sbClient.from('mk_product_costs').select('cost_price').eq('product_id', p.id).maybeSingle();
    cost = data ? data.cost_price : null;
  }
  // atribuído a mkForm só DEPOIS de abrir o modal: mkOpenModal() fecha o modal anterior, e o fechamento zera mkForm
  const form0 = {
    id: p ? p.id : null,
    images: p ? (p.images || []).map(function (i) { return { id: i.id, path: i.path, url: i.url, isNew: false }; }) : [],
    removed: [], uploading: 0, saved: false,
    setId: p ? p.set_id : null, cardN: p ? p.card_n : null, startQty: p ? mkQty(p) : 0,
  };
  const v = p || { kind: 'selado', status: 'rascunho', low_stock_alert: 1 };
  const kindIsCard = v.kind === 'carta';
  const html =
    '<h3 class="mk-form-title">' + (p ? 'Editar produto' : 'Novo produto') + '</h3>' +
    '<div class="mk-form">' +
      '<label class="mk-f"><span>Tipo</span><select id="mkf-kind" onchange="mkFormKind()">' + mkOpt(MK_KIND_LBL, v.kind) + '</select></label>' +
      '<div id="mkf-card-box" style="display:' + (kindIsCard ? '' : 'none') + '">' +
        '<label class="mk-f"><span>Vincular carta do catálogo (opcional)</span><input id="mkf-cat" type="search" placeholder="Digite o nome da carta…" oninput="mkCatSearch(this.value)" autocomplete="off"></label>' +
        '<div id="mkf-cat-res" class="mk-cat-res"></div>' +
        '<div id="mkf-cat-linked" class="mk-cat-linked"></div>' +
        '<div class="mk-f-row">' +
          '<label class="mk-f"><span>Condição</span><select id="mkf-cond">' + mkOpt(MK_COND_LBL, v.condition, '—') + '</select></label>' +
          '<label class="mk-f"><span>Idioma</span><select id="mkf-lang">' + mkOpt(MK_LANG_LBL, v.language, '—') + '</select></label>' +
          '<label class="mk-f"><span>Versão</span><select id="mkf-ver">' + mkOpt(MK_VER_LBL, v.version, '—') + '</select></label>' +
        '</div>' +
      '</div>' +
      '<label class="mk-f"><span>Nome do produto *</span><input id="mkf-title" maxlength="140" value="' + mkEsc(v.title || '') + '" placeholder="Ex.: Booster Box Mega Evolução"></label>' +
      '<label class="mk-f"><span>Descrição</span><textarea id="mkf-desc" maxlength="4000" rows="4" placeholder="Detalhes, estado, o que acompanha…">' + mkEsc(v.description || '') + '</textarea></label>' +
      '<div class="mk-f-row">' +
        '<label class="mk-f"><span>Preço (R$) *</span><input id="mkf-price" inputmode="decimal" value="' + mkEsc(mkMoneyInput(v.price)) + '" placeholder="0,00"></label>' +
        '<label class="mk-f"><span>Preço “de” (riscado)</span><input id="mkf-old" inputmode="decimal" value="' + mkEsc(mkMoneyInput(v.compare_at_price)) + '" placeholder="opcional"></label>' +
        '<label class="mk-f"><span>Custo (R$) <em>só você vê</em></span><input id="mkf-cost" inputmode="decimal" value="' + mkEsc(mkMoneyInput(cost)) + '" placeholder="opcional"></label>' +
      '</div>' +
      '<div class="mk-f-row">' +
        '<label class="mk-f"><span>Quantidade em estoque</span><input id="mkf-qty" type="number" min="0" step="1" value="' + (p ? mkQty(p) : 0) + '"></label>' +
        '<label class="mk-f"><span>Avisar quando baixar de</span><input id="mkf-low" type="number" min="0" step="1" value="' + (v.low_stock_alert == null ? 1 : v.low_stock_alert) + '"></label>' +
        '<label class="mk-f"><span>Código (SKU)</span><input id="mkf-sku" maxlength="40" value="' + mkEsc(v.sku || '') + '" placeholder="opcional"></label>' +
      '</div>' +
      '<label class="mk-check"><input type="checkbox" id="mkf-featured"' + (v.featured ? ' checked' : '') + '> ⭐ Destaque (aparece primeiro nos banners e na vitrine)</label>' +
      '<label class="mk-f"><span>Situação</span><select id="mkf-status">' + mkOpt(
        p ? MK_STATUS_LBL : { rascunho: 'Rascunho (só você vê)', ativo: 'Ativo (aparece na vitrine)', pausado: 'Pausado' }, v.status) + '</select></label>' +
      '<details class="mk-f-more"><summary>Peso e medidas (para o frete, opcional)</summary>' +
        '<div class="mk-f-row">' +
          '<label class="mk-f"><span>Peso (g)</span><input id="mkf-w" type="number" min="1" step="1" value="' + mkEsc(v.weight_g || '') + '"></label>' +
          '<label class="mk-f"><span>Comp. (cm)</span><input id="mkf-l" inputmode="decimal" value="' + mkEsc(v.length_cm || '') + '"></label>' +
          '<label class="mk-f"><span>Larg. (cm)</span><input id="mkf-wd" inputmode="decimal" value="' + mkEsc(v.width_cm || '') + '"></label>' +
          '<label class="mk-f"><span>Alt. (cm)</span><input id="mkf-h" inputmode="decimal" value="' + mkEsc(v.height_cm || '') + '"></label>' +
        '</div></details>' +
      '<div class="mk-f"><span>Fotos <em id="mkf-photo-count"></em></span>' +
        '<div class="mk-drop" id="mkf-drop">' +
          '<button type="button" class="btn-mini" onclick="document.getElementById(\'mkf-file\').click()">📷 Escolher fotos</button>' +
          '<input type="file" id="mkf-file" accept="image/*" multiple style="display:none" onchange="mkFormPhotos(this.files);this.value=\'\'">' +
          '<span class="mk-drop-hint">ou arraste as fotos aqui. A primeira é a capa.</span>' +
        '</div>' +
        '<div id="mkf-photos" class="mk-photos"></div>' +
        '<div id="mkf-photo-status" class="mk-hint"></div>' +
      '</div>' +
      '<div id="mkf-err" class="mk-form-err"></div>' +
      '<div class="mk-form-actions"><button type="button" class="btn-mini mk-primary" id="mkf-save" onclick="mkSaveProduct()">💾 Salvar produto</button>' +
        '<button type="button" class="btn-mini" onclick="mkCloseModal()">Cancelar</button></div>' +
    '</div>';
  mkOpenModal(html, { wide: true, sticky: true });
  mkForm = form0;
  mkFormRenderPhotos();
  mkFormRenderLinked();
  const drop = document.getElementById('mkf-drop');
  if (drop) {
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); mkFormPhotos(e.dataTransfer.files); });
  }
}
window.mkOpenProductForm = mkOpenProductForm;

function mkFormKind() {
  const k = document.getElementById('mkf-kind').value;
  document.getElementById('mkf-card-box').style.display = k === 'carta' ? '' : 'none';
}
window.mkFormKind = mkFormKind;

function mkOnModalClosed() {   // chamado por mkCloseModal(): se cancelou, apaga as fotos novas que já subiram
  if (mkForm && !mkForm.saved) mkRemoveStorage(mkForm.images.filter(function (i) { return i.isNew; }).map(function (i) { return i.path; }));
  mkForm = null;
}
window.mkOnModalClosed = mkOnModalClosed;

// catálogo de cartas (vincula set/número; a loja continua usando as próprias fotos)
function mkCatSearch(q) {
  const box = document.getElementById('mkf-cat-res');
  if (!box) return;
  const term = String(q || '').trim().toLowerCase();
  if (term.length < 3 || typeof getAllCatalogCards !== 'function') { box.innerHTML = ''; return; }
  if (!mkCatCache) mkCatCache = getAllCatalogCards();
  const hits = [];
  for (let i = 0; i < mkCatCache.length && hits.length < 8; i++) {
    const c = mkCatCache[i];
    if (String(c.name || '').toLowerCase().indexOf(term) >= 0) hits.push(c);
  }
  box.innerHTML = hits.length ? hits.map(function (c, i) {
    return '<button type="button" class="mk-cat-item" onclick="mkCatPick(' + mkCatCache.indexOf(c) + ')">' + mkEsc(c.name) + ' <small>' + mkEsc(String(c._setId || '').toUpperCase()) + ' #' + mkEsc(c.n) + (c.rare ? ' · ' + mkEsc(c.rare) : '') + '</small></button>';
  }).join('') : '<div class="mk-hint">Nenhuma carta com esse nome.</div>';
}
function mkCatPick(idx) {
  const c = mkCatCache && mkCatCache[idx];
  if (!c || !mkForm) return;
  mkForm.setId = c._setId; mkForm.cardN = c.n;
  const t = document.getElementById('mkf-title');
  if (t && !t.value.trim()) t.value = c.name;
  document.getElementById('mkf-cat-res').innerHTML = '';
  document.getElementById('mkf-cat').value = '';
  mkFormRenderLinked();
}
function mkCatUnlink() { if (mkForm) { mkForm.setId = null; mkForm.cardN = null; mkFormRenderLinked(); } }
function mkFormRenderLinked() {
  const el = document.getElementById('mkf-cat-linked');
  if (!el || !mkForm) return;
  el.innerHTML = mkForm.setId && mkForm.cardN
    ? '<span class="mk-chip mk-chip-ativo">🔗 ' + mkEsc(String(mkForm.setId).toUpperCase()) + ' #' + mkEsc(mkForm.cardN) + '</span> <button type="button" class="btn-mini" onclick="mkCatUnlink()">desvincular</button>' : '';
}
window.mkCatSearch = mkCatSearch; window.mkCatPick = mkCatPick; window.mkCatUnlink = mkCatUnlink;

// fotos do formulário
function mkFormRenderPhotos() {
  const box = document.getElementById('mkf-photos');
  if (!box || !mkForm) return;
  const n = mkForm.images.length;
  const cnt = document.getElementById('mkf-photo-count');
  if (cnt) cnt.textContent = '(' + n + '/' + MK_MAX_PHOTOS + ')';
  box.innerHTML = mkForm.images.map(function (im, i) {
    return '<div class="mk-photo' + (i === 0 ? ' cover' : '') + '"><img src="' + mkEsc(im.url) + '" alt="Foto ' + (i + 1) + '">' +
      (i === 0 ? '<span class="mk-photo-cover">capa</span>' : '') +
      '<div class="mk-photo-bar">' +
        '<button type="button" title="Mover para a esquerda" ' + (i === 0 ? 'disabled' : '') + ' onclick="mkPhotoMove(' + i + ',-1)">◀</button>' +
        '<button type="button" title="Mover para a direita" ' + (i === n - 1 ? 'disabled' : '') + ' onclick="mkPhotoMove(' + i + ',1)">▶</button>' +
        '<button type="button" title="Remover" onclick="mkPhotoRemove(' + i + ')">✕</button>' +
      '</div></div>';
  }).join('');
}
function mkPhotoMove(i, d) {
  const a = mkForm.images, j = i + d;
  if (j < 0 || j >= a.length) return;
  const t = a[i]; a[i] = a[j]; a[j] = t;
  mkFormRenderPhotos();
}
function mkPhotoRemove(i) {
  const im = mkForm.images[i];
  mkForm.images.splice(i, 1);
  if (im.isNew) mkRemoveStorage([im.path]);           // ainda não estava salva: apaga o arquivo já
  else mkForm.removed.push(im);                        // já salva: só apaga quando clicar em Salvar
  mkFormRenderPhotos();
}
async function mkFormPhotos(fileList) {
  if (!mkForm) return;
  const files = Array.prototype.slice.call(fileList || []).filter(function (f) { return /^image\//.test(f.type || ''); });
  if (!files.length) return;
  const room = MK_MAX_PHOTOS - mkForm.images.length;
  if (room <= 0) { mkFormStatus('Máximo de ' + MK_MAX_PHOTOS + ' fotos por produto.', true); return; }
  const take = files.slice(0, room);
  if (files.length > room) mkFormStatus('Só as primeiras ' + room + ' foram usadas (máx. ' + MK_MAX_PHOTOS + ').', true);
  const form = mkForm;
  const save = document.getElementById('mkf-save');
  if (save) save.disabled = true;
  form.uploading += take.length;
  for (let i = 0; i < take.length; i++) {
    mkFormStatus('Enviando foto ' + (i + 1) + ' de ' + take.length + '…');
    try {
      const up = await mkUploadImage(take[i], 'p');
      if (mkForm !== form) { mkRemoveStorage([up.path]); return; }   // fechou o formulário no meio
      form.images.push({ path: up.path, url: up.url, isNew: true });
      mkFormRenderPhotos();
    } catch (e) {
      mkFormStatus('Não deu pra enviar “' + take[i].name + '”: ' + (e.message || e), true);
    }
    form.uploading--;
  }
  if (mkForm === form) {
    if (!document.querySelector('#mkf-photo-status.err')) mkFormStatus('');
    const s2 = document.getElementById('mkf-save'); if (s2) s2.disabled = false;
  }
}
function mkFormStatus(msg, isErr) {
  const el = document.getElementById('mkf-photo-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'mk-hint' + (isErr ? ' err' : '');
}
window.mkPhotoMove = mkPhotoMove; window.mkPhotoRemove = mkPhotoRemove; window.mkFormPhotos = mkFormPhotos;

function mkFormErr(msg) { const e = document.getElementById('mkf-err'); if (e) e.textContent = msg || ''; }

async function mkSaveProduct() {
  if (!mkForm || mkForm.uploading > 0) { mkFormErr('Aguarde as fotos terminarem de enviar.'); return; }
  const val = function (id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
  const title = val('mkf-title');
  const price = mkParseMoney(val('mkf-price'));
  const old = mkParseMoney(val('mkf-old'));
  const cost = mkParseMoney(val('mkf-cost'));
  const qty = parseInt(val('mkf-qty') || '0', 10);
  const low = parseInt(val('mkf-low') || '0', 10);
  const kind = val('mkf-kind');
  if (title.length < 2) { mkFormErr('Informe o nome do produto.'); return; }
  if (price == null || !Number.isFinite(price) || price < 0) { mkFormErr('Informe um preço válido (ex.: 34,90).'); return; }
  if (old != null && (!Number.isFinite(old) || old <= 0)) { mkFormErr('O preço “de” precisa ser um valor maior que zero.'); return; }
  if (old != null && old <= price) { mkFormErr('O preço “de” precisa ser maior que o preço atual (ou deixe em branco).'); return; }
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) { mkFormErr('Custo inválido.'); return; }
  if (!Number.isFinite(qty) || qty < 0) { mkFormErr('A quantidade não pode ser negativa.'); return; }
  const status = val('mkf-status');
  if (status === 'ativo' && !mkForm.images.length && !confirm('Sem foto o produto aparece só com um ícone. Publicar mesmo assim?')) return;
  const num = function (id) { const t = val(id).replace(',', '.'); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n > 0 ? n : null; };
  const row = {
    kind: kind, title: title, description: val('mkf-desc') || null, sku: val('mkf-sku') || null,
    featured: !!(document.getElementById('mkf-featured') || {}).checked,
    price: price, compare_at_price: old, low_stock_alert: Number.isFinite(low) && low >= 0 ? low : 1, status: status,
    weight_g: num('mkf-w') ? Math.round(num('mkf-w')) : null, length_cm: num('mkf-l'), width_cm: num('mkf-wd'), height_cm: num('mkf-h'),
    set_id: kind === 'carta' ? mkForm.setId : null, card_n: kind === 'carta' ? mkForm.cardN : null,
    condition: kind === 'carta' ? (val('mkf-cond') || null) : null,
    language: kind === 'carta' ? (val('mkf-lang') || null) : null,
    version: kind === 'carta' ? (val('mkf-ver') || null) : null,
  };
  const btn = document.getElementById('mkf-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  mkFormErr('');
  try {
    let pid = mkForm.id;
    if (pid) {
      const { error } = await sbClient.from('mk_products').update(row).eq('id', pid);
      if (error) throw error;
    } else {
      row.seller_id = mk.seller.id;
      const { data, error } = await sbClient.from('mk_products').insert(row).select('id').single();
      if (error) throw error;
      pid = data.id;
    }
    // fotos: remove as marcadas, grava as novas, grava a ordem
    if (mkForm.removed.length) {
      const { error } = await sbClient.from('mk_product_images').delete().in('id', mkForm.removed.map(function (i) { return i.id; }));
      if (error) throw error;
      mkRemoveStorage(mkForm.removed.map(function (i) { return i.path; }));
    }
    for (let i = 0; i < mkForm.images.length; i++) {
      const im = mkForm.images[i];
      if (im.id) {
        const { error } = await sbClient.from('mk_product_images').update({ position: i }).eq('id', im.id);
        if (error) throw error;
      } else {
        const { data, error } = await sbClient.from('mk_product_images').insert({ product_id: pid, path: im.path, url: im.url, position: i }).select('id').single();
        if (error) throw error;
        im.id = data.id; im.isNew = false;
      }
    }
    // custo (privado)
    if (cost != null) {
      const { error } = await sbClient.from('mk_product_costs').upsert({ product_id: pid, cost_price: cost, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else if (mkForm.id) {
      await sbClient.from('mk_product_costs').delete().eq('product_id', pid);
    }
    // estoque: só pelas funções (gera extrato)
    if (!mkForm.id) {
      if (qty > 0) { const { error } = await sbClient.rpc('mk_adjust_stock', { p_product: pid, p_delta: qty, p_kind: 'inicial', p_note: 'Estoque inicial' }); if (error) throw error; }
    } else if (qty !== mkForm.startQty) {
      const { error } = await sbClient.rpc('mk_set_stock', { p_product: pid, p_qty: qty, p_note: 'Ajuste pelo cadastro do produto' });
      if (error) throw error;
    }
    mkForm.saved = true;
    mkCloseModal();
    await mkLoadAll(true);
    mkToast('Produto salvo.');
    if (mk.view === 'panel') mkRenderPanel();
  } catch (err) {
    console.error('[mk] salvar produto', err);
    mkFormErr('Não consegui salvar: ' + ((err && err.message) || err));
    if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar produto'; }
  }
}
window.mkSaveProduct = mkSaveProduct;

// ══════════════════ ESTOQUE ══════════════════
function mkStockTabHtml() {
  const list = mk.products.filter(function (p) { return p.status !== 'arquivado'; })
    .sort(function (a, b) { return mkQty(a) - mkQty(b) || a.title.localeCompare(b.title, 'pt-BR'); });
  if (!list.length) return '<div class="mk-empty">Cadastre produtos primeiro, depois controle o estoque aqui.</div>';
  const al = mkStockAlerts();
  return '<div class="mk-hint" style="margin-bottom:10px">Mostra primeiro o que está acabando. Toda mudança fica registrada no extrato (🕘).' +
    (al.out || al.low ? ' · <b>' + al.out + '</b> esgotado(s), <b>' + al.low + '</b> com estoque baixo.' : '') + '</div>' +
    '<div class="mk-rows">' + list.map(function (p) {
      const q = mkQty(p), r = mkReserved(p);
      const cls = p.status === 'ativo' ? (q <= 0 ? ' out' : (q <= (p.low_stock_alert || 0) ? ' low' : '')) : '';
      return '<div class="mk-row mk-row-st" id="mk-srow-' + p.id + '">' +
        '<div class="mk-row-main"><div class="mk-row-title">' + mkEsc(p.title) + '</div>' +
          '<div class="mk-row-sub"><span class="mk-chip mk-chip-' + p.status + '">' + mkEsc(MK_STATUS_LBL[p.status] || p.status) + '</span>' + (r ? ' · ' + r + ' reservado(s)' : '') + ' · avisar em ' + (p.low_stock_alert || 0) + '</div></div>' +
        '<div class="mk-stepper' + cls + '">' +
          '<button type="button" onclick="mkQuickStock(' + p.id + ',-1)" aria-label="Tirar 1">−</button>' +
          '<input type="number" min="0" step="1" id="mk-sq-' + p.id + '" value="' + q + '" aria-label="Quantidade" onkeydown="if(event.key===\'Enter\')mkSetStockRow(' + p.id + ')">' +
          '<button type="button" onclick="mkQuickStock(' + p.id + ',1)" aria-label="Colocar 1">+</button>' +
        '</div>' +
        '<div class="mk-row-actions"><button type="button" class="btn-mini" onclick="mkSetStockRow(' + p.id + ')">Salvar</button>' +
          '<button type="button" class="btn-mini" onclick="mkQuickStock(' + p.id + ',5)">+5</button>' +
          '<button type="button" class="btn-mini" title="Extrato de movimentações" onclick="mkStockHistory(' + p.id + ')">🕘</button></div>' +
      '</div>';
    }).join('') + '</div>';
}

function mkApplyStock(pid, row) {
  const p = mk.products.find(function (x) { return x.id === pid; });
  if (p) p.stock = { qty_available: row.qty_available, qty_reserved: row.qty_reserved };
  mkRenderPanelBody();
}
async function mkQuickStock(pid, delta) {
  const { data, error } = await sbClient.rpc('mk_adjust_stock', { p_product: pid, p_delta: delta, p_kind: delta > 0 ? 'entrada' : 'saida', p_note: null });
  if (error) { mkToast(error.message, true); return; }
  mkApplyStock(pid, data);
}
async function mkSetStockRow(pid) {
  const el = document.getElementById('mk-sq-' + pid);
  const n = parseInt(el ? el.value : '', 10);
  if (!Number.isFinite(n) || n < 0) { mkToast('Informe uma quantidade válida.', true); return; }
  const p = mk.products.find(function (x) { return x.id === pid; });
  if (p && n === mkQty(p)) { mkToast('A quantidade já é essa.'); return; }
  const { data, error } = await sbClient.rpc('mk_set_stock', { p_product: pid, p_qty: n, p_note: 'Contagem de estoque' });
  if (error) { mkToast(error.message, true); return; }
  mkApplyStock(pid, data);
  mkToast('Estoque atualizado.');
}
async function mkStockHistory(pid) {
  const p = mk.products.find(function (x) { return x.id === pid; });
  const { data, error } = await sbClient.from('mk_stock_moves').select('delta,qty_after,kind,note,created_at').eq('product_id', pid).order('created_at', { ascending: false }).limit(40);
  const KIND = { inicial: 'Estoque inicial', entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', venda: 'Venda', reserva: 'Reserva', liberacao: 'Reserva liberada', cancelamento: 'Cancelamento' };
  const rows = (data || []).map(function (m) {
    const d = new Date(m.created_at);
    return '<tr><td>' + d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</td><td>' + mkEsc(KIND[m.kind] || m.kind) + '</td><td class="n ' + (m.delta > 0 ? 'pos' : 'neg') + '">' + (m.delta > 0 ? '+' : '') + m.delta + '</td><td class="n">' + m.qty_after + '</td><td>' + mkEsc(m.note || '') + '</td></tr>';
  }).join('');
  mkOpenModal('<h3 class="mk-form-title">Extrato · ' + mkEsc(p ? p.title : '') + '</h3>' +
    (error ? '<div class="mk-empty">Não consegui carregar o extrato.</div>' :
      (rows ? '<div class="mk-scroll"><table class="mk-table"><tr><th>Quando</th><th>Movimento</th><th class="n">Qtd.</th><th class="n">Ficou</th><th>Obs.</th></tr>' + rows + '</table></div>' : '<div class="mk-empty">Sem movimentações ainda.</div>')));
}
window.mkQuickStock = mkQuickStock; window.mkSetStockRow = mkSetStockRow; window.mkStockHistory = mkStockHistory;

// ══════════════════ DADOS DA LOJA ══════════════════
function mkConfigTabHtml() {
  const s = mk.seller;
  const f = function (id, label, val, extra) {
    return '<label class="mk-f"><span>' + label + '</span><input id="mkc-' + id + '" value="' + mkEsc(val == null ? '' : val) + '" ' + (extra || '') + '></label>';
  };
  const logo = mkSafeUrl(s.logo_url), banner = mkSafeUrl(s.banner_url);
  return '<div class="mk-form">' +
    '<div class="mk-f-row">' +
      '<div class="mk-f"><span>Logo</span><div class="mk-brand">' + (logo ? '<img src="' + mkEsc(logo) + '" alt="">' : '<em>sem logo</em>') +
        '<button type="button" class="btn-mini" onclick="document.getElementById(\'mkc-logo-file\').click()">Trocar</button>' +
        '<input type="file" id="mkc-logo-file" accept="image/*" style="display:none" onchange="mkBrandUpload(this,\'logo\')"></div></div>' +
      '<div class="mk-f"><span>Banner (fundo do topo)</span><div class="mk-brand">' + (banner ? '<img src="' + mkEsc(banner) + '" alt="">' : '<em>sem banner</em>') +
        '<button type="button" class="btn-mini" onclick="document.getElementById(\'mkc-banner-file\').click()">Trocar</button>' +
        (banner ? '<button type="button" class="btn-mini" onclick="mkBrandClear(\'banner\')">Remover</button>' : '') +
        '<input type="file" id="mkc-banner-file" accept="image/*" style="display:none" onchange="mkBrandUpload(this,\'banner\')"></div></div>' +
    '</div>' +
    f('name', 'Nome da loja *', s.name, 'maxlength="80"') +
    '<label class="mk-f"><span>Sobre a loja</span><textarea id="mkc-description" rows="3" maxlength="2000">' + mkEsc(s.description || '') + '</textarea></label>' +
    '<div class="mk-f-row">' + f('city', 'Cidade', s.city) + f('uf', 'UF', s.uf, 'maxlength="2" style="text-transform:uppercase"') + f('cep_origin', 'CEP de postagem', s.cep_origin, 'inputmode="numeric" maxlength="9"') + '</div>' +
    '<div class="mk-f-row">' + f('whatsapp', 'WhatsApp (com DDD)', s.whatsapp, 'inputmode="tel" placeholder="5517999999999"') + f('email', 'E-mail da loja', s.email) + '</div>' +
    '<div class="mk-f-row">' + f('instagram', 'Link do Instagram', s.instagram, 'placeholder="https://…"') + f('tiktok', 'Link do TikTok', s.tiktok, 'placeholder="https://…"') + f('website', 'Site', s.website, 'placeholder="https://…"') + '</div>' +
    '<div class="mk-f-row">' + f('legal_name', 'Razão social (se tiver)', s.legal_name) + f('cnpj', 'CNPJ (se tiver)', s.cnpj, 'inputmode="numeric"') + '</div>' +
    '<h4 class="mk-sub">Chamada do banner (opcional)</h4>' +
    '<div class="mk-hint">Os banners do site se montam sozinhos com seus produtos. Se quiser, escreva uma chamada própria para o banner do Início (ex.: “Reinado Delta chega dia 6”). Em branco, usa o texto padrão.</div>' +
    f('promo_title', 'Título da chamada', s.promo_title, 'maxlength="80" placeholder="ex.: Reinado Delta chegando"') +
    f('promo_text', 'Texto da chamada', s.promo_text, 'maxlength="200" placeholder="ex.: Reserve o seu pelo WhatsApp"') +
    '<h4 class="mk-sub">Entrega</h4>' +
    '<div class="mk-f-row">' +
      '<label class="mk-f"><span>Posta em até (dias úteis)</span><input id="mkc-handling_days" type="number" min="0" max="60" value="' + (s.handling_days == null ? 3 : s.handling_days) + '"></label>' +
      f('flat_shipping', 'Frete fixo (R$)', s.flat_shipping == null ? '' : mkMoneyInput(s.flat_shipping), 'inputmode="decimal" placeholder="vazio = combinar"') +
      f('free_shipping_over', 'Frete grátis acima de (R$)', s.free_shipping_over == null ? '' : mkMoneyInput(s.free_shipping_over), 'inputmode="decimal" placeholder="opcional"') +
    '</div>' +
    '<label class="mk-check"><input type="checkbox" id="mkc-pickup_enabled"' + (s.pickup_enabled ? ' checked' : '') + '> Aceito retirada em mãos</label>' +
    f('pickup_note', 'Onde / como retirar', s.pickup_note) +
    '<label class="mk-f"><span>Política de trocas e devoluções</span><textarea id="mkc-return_policy" rows="6" maxlength="8000">' + mkEsc(s.return_policy || '') + '</textarea></label>' +
    '<h4 class="mk-sub">Aba “Atacado”</h4>' +
    '<div class="mk-hint">Se preencher, a loja ganha uma aba <b>Atacado</b> com este texto (condições de estoque e importação, pedido mínimo, frete, prazo). Aceita <b>**negrito**</b>, títulos com # e listas com -. Em branco, a aba não aparece.</div>' +
    '<label class="mk-f"><span>Texto da aba Atacado</span><textarea id="mkc-wholesale_info" rows="10" maxlength="8000">' + mkEsc(s.wholesale_info || '') + '</textarea></label>' +
    f('wholesale_url', 'Link do catálogo de importação (opcional, começa com https://)', s.wholesale_url, 'maxlength="500" placeholder="https://…"') +
    (mk.isAdmin ? '<h4 class="mk-sub">Administração do MyDeck</h4><div class="mk-f-row">' +
        '<label class="mk-f"><span>Situação da loja</span><select id="mkc-status">' + ['pendente', 'ativa', 'pausada', 'suspensa'].map(function (x) { return '<option value="' + x + '"' + (s.status === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
        '<label class="mk-f"><span>Comissão do MyDeck (%)</span><input id="mkc-commission_pct" type="number" min="0" max="50" step="0.5" value="' + (s.commission_pct == null ? 5 : s.commission_pct) + '"></label></div>' +
        '<div class="mk-f-row"><label class="mk-check"><input type="checkbox" id="mkc-consign_enabled"' + (s.consign_enabled ? ' checked' : '') + '> Consignação liberada ao público</label>' +
        '<label class="mk-f"><span>Comissão da loja na consignação (%)</span><input id="mkc-consign_commission_pct" type="number" min="0" max="50" step="0.5" value="' + (s.consign_commission_pct == null ? 15 : s.consign_commission_pct) + '"></label></div>'
      : '<div class="mk-hint">Situação: <b>' + mkEsc(s.status) + '</b> · Comissão do MyDeck: <b>' + mkEsc(s.commission_pct) + '%</b> (definidas pelo MyDeck).</div>') +
    '<div id="mkc-err" class="mk-form-err"></div>' +
    '<div class="mk-form-actions"><button type="button" class="btn-mini mk-primary" onclick="mkSaveConfig()">💾 Salvar dados da loja</button></div>' +
  '</div>';
}

async function mkBrandUpload(inputEl, which) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = '';
  if (!file) return;
  try {
    mkToast('Enviando…');
    const up = await mkUploadImage(file, which);
    const col = which === 'logo' ? 'logo_url' : 'banner_url';
    const oldUrl = mk.seller[col];
    const { error } = await sbClient.from('mk_sellers').update({ [col]: up.url }).eq('id', mk.seller.id);
    if (error) { mkRemoveStorage([up.path]); throw error; }
    mk.seller[col] = up.url;
    const m = /\/mk-products\/(.+)$/.exec(oldUrl || '');
    if (m) mkRemoveStorage([decodeURIComponent(m[1])]);   // some com a imagem antiga (se era nossa)
    mkToast('Imagem atualizada.');
    mkRenderPanelBody();
  } catch (e) { mkToast('Não deu pra enviar: ' + ((e && e.message) || e), true); }
}
async function mkBrandClear(which) {
  const col = which === 'logo' ? 'logo_url' : 'banner_url';
  const oldUrl = mk.seller[col];
  const { error } = await sbClient.from('mk_sellers').update({ [col]: null }).eq('id', mk.seller.id);
  if (error) { mkToast(error.message, true); return; }
  mk.seller[col] = null;
  const m = /\/mk-products\/(.+)$/.exec(oldUrl || '');
  if (m) mkRemoveStorage([decodeURIComponent(m[1])]);
  mkRenderPanelBody();
}
window.mkBrandUpload = mkBrandUpload; window.mkBrandClear = mkBrandClear;

async function mkSaveConfig() {
  const g = function (id) { const e = document.getElementById('mkc-' + id); return e ? e.value.trim() : ''; };
  const err = function (m) { const e = document.getElementById('mkc-err'); if (e) e.textContent = m || ''; };
  const name = g('name');
  if (name.length < 2) { err('Informe o nome da loja.'); return; }
  const flat = mkParseMoney(g('flat_shipping')), free = mkParseMoney(g('free_shipping_over'));
  if ((flat != null && (!Number.isFinite(flat) || flat < 0)) || (free != null && (!Number.isFinite(free) || free < 0))) { err('Frete: informe valores válidos ou deixe em branco.'); return; }
  const days = parseInt(g('handling_days') || '3', 10);
  if (!Number.isFinite(days) || days < 0 || days > 60) { err('Prazo de postagem entre 0 e 60 dias.'); return; }
  const urlOrNull = function (v) { v = v.trim(); if (!v) return null; return mkSafeUrl(v) ? v : false; };
  const ig = urlOrNull(g('instagram')), tt = urlOrNull(g('tiktok')), ws = urlOrNull(g('website')), wh = urlOrNull(g('wholesale_url'));
  if (wh === false) { err('O link do catálogo de atacado precisa começar com https://'); return; }
  if (ig === false || tt === false || ws === false) { err('Os links de Instagram, TikTok e site precisam começar com https://'); return; }
  const uf = g('uf').toUpperCase();
  if (uf && uf.length !== 2) { err('UF com 2 letras (ex.: SP).'); return; }
  const row = {
    name: name, description: g('description') || null, city: g('city') || null, uf: uf || null,
    cep_origin: mkDigits(g('cep_origin')) || null, whatsapp: mkDigits(g('whatsapp')) || null, email: g('email') || null,
    instagram: ig, tiktok: tt, website: ws, legal_name: g('legal_name') || null, cnpj: mkDigits(g('cnpj')) || null,
    handling_days: days, flat_shipping: flat, free_shipping_over: free,
    pickup_enabled: !!document.getElementById('mkc-pickup_enabled').checked, pickup_note: g('pickup_note') || null,
    return_policy: g('return_policy') || null,
    wholesale_info: g('wholesale_info') || null, wholesale_url: wh,
    promo_title: g('promo_title') || null, promo_text: g('promo_text') || null,
  };
  if (mk.isAdmin) {
    row.status = g('status') || mk.seller.status;
    const c = parseFloat(g('commission_pct').replace(',', '.'));
    if (Number.isFinite(c) && c >= 0 && c <= 50) row.commission_pct = c;
    row.consign_enabled = !!document.getElementById('mkc-consign_enabled').checked;
    const cc = parseFloat(g('consign_commission_pct').replace(',', '.'));
    if (Number.isFinite(cc) && cc >= 0 && cc <= 50) row.consign_commission_pct = cc;
  }
  err('');
  const { data, error } = await sbClient.from('mk_sellers').update(row).eq('id', mk.seller.id).select('*').single();
  if (error) { err('Não consegui salvar: ' + error.message); return; }
  mk.seller = data;
  mkToast('Dados da loja salvos.');
  mkRenderPanel();
}
window.mkSaveConfig = mkSaveConfig;

// ══════════════════ EQUIPE ══════════════════
async function mkLoadTeam() {
  const body = document.getElementById('mk-panel-body');
  if (!body) return;
  const { data, error } = await sbClient.rpc('mk_list_members', { p_seller: mk.seller.id });
  if (!document.getElementById('mk-panel-body') || mk.panelTab !== 'equipe') return;
  const ROLE = { dono: 'Dono', gerente: 'Gerente', estoque: 'Estoque' };
  body.innerHTML = '<div class="mk-hint" style="margin-bottom:10px">Quem está aqui consegue cadastrar produtos, mexer no estoque e editar a loja. A pessoa precisa já ter conta no MyDeck.</div>' +
    (error ? '<div class="mk-empty">Não consegui carregar a equipe: ' + mkEsc(error.message) + '</div>' :
      ((data || []).length ? '<div class="mk-rows">' + data.map(function (m) {
        return '<div class="mk-row mk-row-team"><div class="mk-row-main"><div class="mk-row-title">' + mkEsc(m.name || m.email) + '</div><div class="mk-row-sub">' + mkEsc(m.email) + '</div></div>' +
          '<div><span class="mk-chip">' + mkEsc(ROLE[m.role] || m.role) + '</span></div>' +
          '<div class="mk-row-actions"><button type="button" class="btn-mini btn-mini-danger" onclick="mkRemoveMember(\'' + m.user_id + '\')">Remover</button></div></div>';
      }).join('') + '</div>' : '<div class="mk-empty">Ninguém na equipe ainda (o admin do MyDeck sempre tem acesso).</div>')) +
    '<h4 class="mk-sub">Adicionar pessoa</h4>' +
    '<div class="mk-f-row"><label class="mk-f"><span>E-mail da conta MyDeck</span><input id="mkt-email" type="email" placeholder="pessoa@email.com"></label>' +
      '<label class="mk-f"><span>Papel</span><select id="mkt-role"><option value="gerente">Gerente (tudo, menos equipe)</option><option value="estoque">Estoque</option><option value="dono">Dono (inclui equipe)</option></select></label></div>' +
    '<div id="mkt-err" class="mk-form-err"></div>' +
    '<div class="mk-form-actions"><button type="button" class="btn-mini mk-primary" onclick="mkAddMember()">➕ Adicionar</button></div>';
}
async function mkAddMember() {
  const email = (document.getElementById('mkt-email').value || '').trim();
  const role = document.getElementById('mkt-role').value;
  const err = document.getElementById('mkt-err');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Informe um e-mail válido.'; return; }
  const { error } = await sbClient.rpc('mk_add_member', { p_seller: mk.seller.id, p_email: email, p_role: role });
  if (error) { err.textContent = error.message; return; }
  mkToast('Pessoa adicionada.');
  mkLoadTeam();
}
async function mkRemoveMember(userId) {
  if (!confirm('Remover esta pessoa da equipe da loja?')) return;
  const { error } = await sbClient.rpc('mk_remove_member', { p_seller: mk.seller.id, p_user: userId });
  if (error) { mkToast(error.message, true); return; }
  mkToast('Removida.');
  mkLoadTeam();
}
window.mkAddMember = mkAddMember; window.mkRemoveMember = mkRemoveMember;
