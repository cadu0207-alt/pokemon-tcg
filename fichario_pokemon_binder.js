// fichario_pokemon_binder.js — "Fichários de Pokémon" (21/08/2026)
//
// Pedido do Eduardo: dentro de Meus Fichários, uma categoria nova onde cada
// fichário é dedicado a UM Pokémon específico. Fluxo:
//   1) escolhe nome + grade (2x2/3x3/4x4) → cria o fichário (vazio, só com
//      a marcação dos slots);
//   2) escolhe o Pokémon por dex ou nome;
//   3) escolhe a carta (QUALQUER versão de QUALQUER coleção do site — não só
//      as que o Eduardo já tem; as que ele não tem aparecem apagadas/cinza,
//      as que ele já tem aparecem coloridas, igual o resto do fichário);
//   4) arrasta a carta escolhida até o slot vazio onde quiser que ela fique;
//   5) "+ Página" adiciona outra página de slots vazios.
//
// DIFERENÇA CHAVE dos fichários 'manual'/'preset' já existentes: aqueles só
// GUARDAM UM FILTRO (quais cartas entram, sem posição fixa — getBinderCards()
// simplesmente lista todas que batem o filtro). Este tipo ('pokemon') guarda
// POSIÇÃO EXATA — custom_binders.pages é um array de páginas, cada página um
// array de tamanho layout*layout com `null` (vazio) ou `{set,n,ver}` (carta
// exata) em cada índice. Precisa da coluna nova `pages` — ver
// custom_binders_pokemon_migration.sql.
//
// Depende de globais de app.js/fichario_patch.js já carregados antes deste
// arquivo: sbClient, uid(), esc(), customBinders, getAllCardsWithSet(),
// getSlots(), slotKey(), collected (Set), VERSIONS, getBinderImg(), fmtR(),
// renderCustomBindersHome(), POKEDEX_NACIONAL (pokedex_nacional.js),
// fmDexOf() (fichario_melhorias_23jul.js).
(function(){

// ── Estado do builder (rascunho em memória — pages só grava no Supabase
// quando o usuário clica em Salvar) ──────────────────────────────────────
let _pk = null; // {id,name,layout,dex,speciesName,pages:[[...]],page:0,isNew}
let _pkDrag = null; // {set,n,ver,card,el} durante um arrastar em andamento

function pkOverlayEl(){ return document.getElementById('pkb-overlay'); }

function pkClose(){
  const ov = pkOverlayEl();
  if (ov) ov.remove();
  _pk = null;
  pkCancelDrag();
}
window.fmPkmnClose = pkClose;

function pkEnsureOverlay(){
  let ov = pkOverlayEl();
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'pkb-overlay';
    ov.className = 'pkb-overlay';
    document.body.appendChild(ov);
  }
  return ov;
}

// ── 1) Criar novo fichário de Pokémon ────────────────────────────────────
window.fmPkmnOpenCreate = function(){
  _pk = { id:null, name:'', layout:3, dex:null, speciesName:'', pages:[Array(9).fill(null)], page:0, isNew:true };
  pkRenderCreateStep();
};

function pkRenderCreateStep(){
  const ov = pkEnsureOverlay();
  ov.innerHTML = `
  <div class="pkb-modal pkb-modal-sm">
    <div class="pkb-modal-head">
      <span>📍 Novo fichário de Pokémon</span>
      <button class="pkb-x" onclick="fmPkmnClose()">✕</button>
    </div>
    <div class="pkb-modal-body">
      <label class="pkb-lbl">Nome do fichário</label>
      <input id="pkb-name-input" class="pkb-input" type="text" placeholder="Ex: Charizard"
             value="${esc(_pk.name)}" maxlength="60">
      <label class="pkb-lbl" style="margin-top:16px">Tamanho da grade</label>
      <div class="pkb-layout-pick" id="pkb-layout-pick">
        ${[2,3,4].map(n=>`<button class="pkb-layout-btn${_pk.layout===n?' active':''}" data-n="${n}"
            onclick="fmPkmnSetLayout(${n})">${n}×${n}</button>`).join('')}
      </div>
      <button class="pkb-btn-primary" style="margin-top:20px;width:100%" onclick="fmPkmnConfirmCreate()">
        Criar e escolher o Pokémon →</button>
    </div>
  </div>`;
}

window.fmPkmnSetLayout = function(n){
  _pk.layout = n;
  document.querySelectorAll('#pkb-layout-pick .pkb-layout-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.n === String(n));
  });
};

window.fmPkmnConfirmCreate = async function(){
  const inp = document.getElementById('pkb-name-input');
  const name = (inp?.value || '').trim();
  if (!name) { alert('Dá um nome pro fichário primeiro (ex: o nome do Pokémon).'); return; }
  if (!uid()) { alert('Você precisa estar logado pra criar um fichário.'); return; }
  const layout = _pk.layout;
  const emptyPage = Array(layout*layout).fill(null);
  const { data, error } = await sbClient.from('custom_binders').insert({
    user_id: uid(), name, emoji:'📍', layout,
    filter_config: { type:'pokemon', dex:null, name:null },
    card_ids: [], cover_color:'#3b82f6', pages: [emptyPage]
  }).select();
  if (error || !data?.[0]) {
    alert('Não foi possível criar o fichário. Verifique se rodou custom_binders_pokemon_migration.sql no Supabase (coluna pages).');
    console.error('fmPkmnConfirmCreate', error);
    return;
  }
  customBinders.unshift(data[0]);
  _pk = { id:data[0].id, name, layout, dex:null, speciesName:'', pages:[emptyPage], page:0, isNew:true };
  pkRenderBuilder();
};

// ── 2) Reabrir builder de um fichário já existente ───────────────────────
window.fmPkmnOpenBuilder = function(binderId){
  const b = customBinders.find(x=>String(x.id)===String(binderId));
  if (!b) return;
  const layout = b.layout || 3;
  const cfg = b.filter_config || {};
  const pages = (b.pages && b.pages.length) ? JSON.parse(JSON.stringify(b.pages)) : [Array(layout*layout).fill(null)];
  _pk = { id:b.id, name:b.name, layout, dex:cfg.dex ?? null, speciesName:cfg.name || '', pages, page:0, isNew:false };
  pkRenderBuilder();
};

// ── 3) Visualização somente-leitura (clique no card na home) ────────────
window.fmPkmnOpenView = function(binderId){
  fmPkmnOpenBuilder(binderId);
};

// ── Builder (tela cheia, 2 colunas) ──────────────────────────────────────
function pkRenderBuilder(){
  const ov = pkEnsureOverlay();
  ov.innerHTML = `
  <div class="pkb-modal pkb-modal-full">
    <div class="pkb-modal-head">
      <span>📍 ${esc(_pk.name)}${_pk.speciesName?` — ${esc(_pk.speciesName)}`:''}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="pkb-btn-primary pkb-btn-sm" onclick="fmPkmnSave()">💾 Salvar</button>
        <button class="pkb-x" onclick="fmPkmnClose()">✕</button>
      </div>
    </div>
    <div class="pkb-modal-body pkb-builder-body">
      <div class="pkb-col-left" id="pkb-col-left"></div>
      <div class="pkb-col-right" id="pkb-col-right"></div>
    </div>
  </div>`;
  pkRenderLeftPanel();
  pkRenderGridPanel();
}

// ── Painel esquerdo: busca de espécie → lista de cartas ──────────────────
function pkRenderLeftPanel(){
  const el = document.getElementById('pkb-col-left');
  if (!el) return;
  if (_pk.dex == null) {
    el.innerHTML = `
      <div class="pkb-lbl">Escolha seu Pokémon</div>
      <input id="pkb-species-search" class="pkb-input" type="text"
             placeholder="Buscar por número (#6) ou nome (Charizard)..." autocomplete="off">
      <div id="pkb-species-results" class="pkb-scroll-list"></div>`;
    const inp = document.getElementById('pkb-species-search');
    inp.addEventListener('input', ()=>pkRenderSpeciesResults(inp.value));
    pkRenderSpeciesResults('');
    inp.focus();
  } else {
    el.innerHTML = `
      <div class="pkb-lbl-row">
        <button class="pkb-back" onclick="fmPkmnBackToSearch()">← trocar Pokémon</button>
      </div>
      <div class="pkb-species-hdr">#${String(_pk.dex).padStart(3,'0')} · ${esc(_pk.speciesName)}</div>
      <div class="pkb-lbl">Escolha a carta — arraste até o fichário</div>
      <div id="pkb-card-list" class="pkb-scroll-list"></div>`;
    pkRenderCardList();
  }
}

window.fmPkmnBackToSearch = function(){
  _pk.dex = null; _pk.speciesName = '';
  pkRenderLeftPanel();
};

function pkRenderSpeciesResults(query){
  const box = document.getElementById('pkb-species-results');
  if (!box) return;
  const list = (typeof POKEDEX_NACIONAL !== 'undefined') ? POKEDEX_NACIONAL : [];
  const q = query.trim().toLowerCase().replace(/^#/, '');
  let matches;
  if (!q) {
    matches = list.slice(0, 40);
  } else if (/^\d+$/.test(q)) {
    const n = parseInt(q, 10);
    matches = list.filter(p => String(p.dex).startsWith(q) || p.dex === n).slice(0, 60);
  } else {
    matches = list.filter(p => p.name.toLowerCase().includes(q)).slice(0, 60);
  }
  if (!matches.length) {
    box.innerHTML = `<div class="pkb-empty">Nenhum Pokémon encontrado.</div>`;
    return;
  }
  box.innerHTML = matches.map(p => `
    <div class="pkb-species-item" onclick="fmPkmnPickSpecies(${p.dex},'${esc(p.name).replace(/'/g,"\\'")}')">
      <span class="pkb-species-dex">#${String(p.dex).padStart(3,'0')}</span>
      <span class="pkb-species-name">${esc(p.name)}</span>
    </div>`).join('');
}

window.fmPkmnPickSpecies = function(dex, name){
  _pk.dex = dex; _pk.speciesName = name;
  pkRenderLeftPanel();
};

function pkRenderCardList(){
  const box = document.getElementById('pkb-card-list');
  if (!box) return;
  const all = getAllCardsWithSet();
  const matches = all.filter(c => (typeof fmDexOf === 'function' ? fmDexOf(c) : c.dex) === _pk.dex);
  if (!matches.length) {
    box.innerHTML = `<div class="pkb-empty">Nenhuma carta desse Pokémon no catálogo ainda.</div>`;
    return;
  }
  // Um item por versão real (N/F/RH/SP) de cada carta — mesma granularidade
  // de slot usada no resto do fichário (getSlots/slotKey).
  const rows = [];
  matches.forEach(c => {
    const setId = c._setId;
    getSlots(c, setId).forEach(s => {
      const key = slotKey(setId + ':', c.n, s.ver);
      rows.push({ set:setId, n:c.n, ver:s.ver, card:c, owned: collected.has(key) });
    });
  });
  box.innerHTML = rows.map((r, i) => {
    const vc = (typeof VERSIONS !== 'undefined') ? VERSIONS.find(v=>v.code===r.ver) : null;
    const img = (typeof getBinderImg === 'function') ? getBinderImg({n:r.n}, r.set) : '';
    return `
    <div class="pkb-card-item${r.owned?'':' pkb-dim'}" data-idx="${i}"
         data-set="${r.set}" data-n="${r.n}" data-ver="${r.ver}"
         title="${esc(r.card.name)} · ${r.set.toUpperCase()} #${r.n} ${r.ver}${r.owned?'':' (você ainda não tem essa)'}">
      <img src="${img}" alt="${esc(r.card.name)}" loading="lazy" draggable="false"
           onerror="this.style.opacity='.15'">
      <div class="pkb-card-item-meta">
        <span class="pkb-card-item-name">${esc(r.card.name)}</span>
        <span class="pkb-card-item-sub">${r.set.toUpperCase()} #${r.n}${vc?` · <span style="color:${vc.color}">${r.ver}</span>`:''}</span>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('.pkb-card-item').forEach(itemEl => {
    itemEl.addEventListener('pointerdown', (e)=>pkStartDrag(e, itemEl));
  });
}

// ── Painel direito: grade + páginas ───────────────────────────────────────
function pkRenderGridPanel(){
  const el = document.getElementById('pkb-col-right');
  if (!el) return;
  const N = _pk.layout;
  const page = _pk.pages[_pk.page] || Array(N*N).fill(null);
  while (page.length < N*N) page.push(null);
  _pk.pages[_pk.page] = page;

  const tabs = _pk.pages.map((_, i) => `
    <button class="pkb-page-tab${i===_pk.page?' active':''}" onclick="fmPkmnGoPage(${i})">${i+1}</button>`).join('');

  el.innerHTML = `
    <div class="pkb-page-tabs">
      ${tabs}
      <button class="pkb-page-add" onclick="fmPkmnAddPage()" title="Adicionar página">+ página</button>
    </div>
    <div class="pkb-grid-wrap">
      <div class="pkb-grid" style="grid-template-columns:repeat(${N}, 1fr)">
        ${page.map((slot, idx) => pkSlotHtml(slot, idx)).join('')}
      </div>
    </div>`;
  el.querySelectorAll('.pkb-slot').forEach(s => {
    s.addEventListener('pointerup', ()=>pkDropOnSlot(parseInt(s.dataset.idx, 10)));
  });
}

function pkSlotHtml(slot, idx){
  if (!slot) {
    return `<div class="pkb-slot pkb-slot-empty" data-idx="${idx}"><span>${idx+1}</span></div>`;
  }
  const img = (typeof getBinderImg === 'function') ? getBinderImg({n:slot.n}, slot.set) : '';
  return `<div class="pkb-slot pkb-slot-filled" data-idx="${idx}">
    <img src="${img}" alt="" loading="lazy" onerror="this.style.opacity='.2'">
    <button class="pkb-slot-remove" onclick="event.stopPropagation();fmPkmnRemoveSlot(${idx})" title="Remover">✕</button>
  </div>`;
}

window.fmPkmnGoPage = function(i){ _pk.page = i; pkRenderGridPanel(); };
window.fmPkmnAddPage = function(){
  _pk.pages.push(Array(_pk.layout*_pk.layout).fill(null));
  _pk.page = _pk.pages.length - 1;
  pkRenderGridPanel();
};
window.fmPkmnRemoveSlot = function(idx){
  _pk.pages[_pk.page][idx] = null;
  pkRenderGridPanel();
};

// ── Arrastar (Pointer Events — funciona com mouse e touch, mesmo padrão de
// centralizacao.js) ───────────────────────────────────────────────────────
function pkStartDrag(e, itemEl){
  e.preventDefault();
  const { set, n, ver } = itemEl.dataset;
  _pkDrag = { set, n, ver };
  const ghost = itemEl.cloneNode(true);
  ghost.className = 'pkb-drag-ghost';
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = e.clientY + 'px';
  document.body.appendChild(ghost);
  _pkDrag.el = ghost;
  try { itemEl.setPointerCapture(e.pointerId); } catch(err){}
  window.addEventListener('pointermove', pkMoveDrag);
  window.addEventListener('pointerup', pkEndDrag, { once:true });
  window.addEventListener('pointercancel', pkCancelDrag, { once:true });
}

function pkMoveDrag(e){
  if (!_pkDrag?.el) return;
  _pkDrag.el.style.left = e.clientX + 'px';
  _pkDrag.el.style.top = e.clientY + 'px';
  document.querySelectorAll('.pkb-slot-over').forEach(s=>s.classList.remove('pkb-slot-over'));
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const slot = under?.closest('.pkb-slot');
  if (slot) slot.classList.add('pkb-slot-over');
}

function pkEndDrag(e){
  window.removeEventListener('pointermove', pkMoveDrag);
  if (_pkDrag) {
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under?.closest('.pkb-slot');
    if (slot) pkDropOnSlot(parseInt(slot.dataset.idx, 10));
  }
  pkCancelDrag();
}

function pkDropOnSlot(idx){
  if (!_pkDrag) return;
  _pk.pages[_pk.page][idx] = { set:_pkDrag.set, n:_pkDrag.n, ver:_pkDrag.ver };
  pkRenderGridPanel();
}

function pkCancelDrag(){
  document.querySelectorAll('.pkb-slot-over').forEach(s=>s.classList.remove('pkb-slot-over'));
  if (_pkDrag?.el) _pkDrag.el.remove();
  _pkDrag = null;
  window.removeEventListener('pointermove', pkMoveDrag);
}

// ── Salvar ─────────────────────────────────────────────────────────────
window.fmPkmnSave = async function(){
  if (!_pk?.id) return;
  const payload = {
    layout: _pk.layout,
    filter_config: { type:'pokemon', dex:_pk.dex, name:_pk.speciesName },
    pages: _pk.pages,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await sbClient.from('custom_binders').update(payload).eq('id', _pk.id).select();
  if (error) {
    alert('Não foi possível salvar o fichário. Verifique se rodou custom_binders_pokemon_migration.sql no Supabase.');
    console.error('fmPkmnSave', error);
    return;
  }
  const idx = customBinders.findIndex(b => String(b.id) === String(_pk.id));
  if (idx >= 0 && data?.[0]) customBinders[idx] = { ...customBinders[idx], ...data[0] };
  pkClose();
  if (typeof renderCustomBindersHome === 'function') renderCustomBindersHome();
};

})();
