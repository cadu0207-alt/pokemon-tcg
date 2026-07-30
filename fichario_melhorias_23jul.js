// fichario_melhorias_23jul.js — 8 melhorias de UX pedidas pelo Eduardo em
// 22-23/jul/2026 (ANALISE_FICHARIO_22jul2026.md, secoes 2 e 3, + Pokedex
// Nacional). Carrega DEPOIS de app.js/fichario_patch.js/pokedex_nacional.js
// e faz monkey-patch das funcoes globais (padrao ja usado por xp_system.js/
// admin_stats.js) em vez de editar os arquivos grandes direto — ver
// [[feedback_coding]] sobre truncamento de Edit/Write nesses arquivos.
// Prefixo namespaced 'fm' em tudo que e novo, pra nao colidir com nomes ja
// usados (getSetCards, getSetData, getSlots etc. — ver [[feedback_coding]]).
(function(){

// ─────────────────────────────────────────────────────────────────
// Toolbar reorganizada (23/07/2026) — menu "⋯ Mais ações" (copiar lista/
// imprimir/compartilhar). Chamado via onclick inline no HTML, por isso
// precisa estar em window explicitamente (o resto do arquivo é IIFE).
// Ver ANALISE_FICHARIO_PROFISSIONAL_23jul2026.md secao 1/2.
// ─────────────────────────────────────────────────────────────────
function ficToggleMoreMenu(e){
  if(e) e.stopPropagation();
  const menu=document.getElementById('fic-more-menu');
  if(!menu) return;
  menu.classList.toggle('open');
}
function ficCloseMoreMenu(){
  const menu=document.getElementById('fic-more-menu');
  if(menu) menu.classList.remove('open');
}
window.ficToggleMoreMenu=ficToggleMoreMenu;
window.ficCloseMoreMenu=ficCloseMoreMenu;
// Fecha o menu ao clicar fora dele
document.addEventListener('click', function(e){
  const menu=document.getElementById('fic-more-menu');
  const btn=document.getElementById('fic-more-btn');
  if(!menu||!menu.classList.contains('open')) return;
  if(e.target===btn||menu.contains(e.target)) return;
  menu.classList.remove('open');
});

// ─────────────────────────────────────────────────────────────────
// #30 (23/07/2026) — Reconstrói #fic-set-info como cabeçalho de 2 linhas.
// Substitui o innerHTML de linha única de fichario_patch.js (renderBinder)
// por: linha 1 = título do set + % em destaque + barra de progresso;
// linha 2 = metadados secundários (slots, Base/Secretas, preço atualizado,
// chase card, dica de uso). Absorve o que #15 (fmInjectSectionProgress,
// mantida abaixo mas não mais chamada) fazia, sem duplicar a barra extra.
// Ver ANALISE_FICHARIO_PROFISSIONAL_23jul2026.md secao 1, item 4.
// ─────────────────────────────────────────────────────────────────
function fmRebuildSetInfoHeader(){
  if(typeof getSetCards!=='function'||typeof currentSet==='undefined') return;
  const infoEl=document.getElementById('fic-set-info');
  if(!infoEl||infoEl.style.display==='none') return;
  const cards=getSetCards();

  function countFor(list){
    let t=0,c=0;
    list.forEach(cd=>{ getSlots(cd,currentSet).forEach(s=>{ t++; if(collected.has(`${currentSet}:${cd.n}:${s.ver}`))c++; }); });
    return {t,c};
  }
  const all=countFor(cards);
  const pct=all.t?Math.round(all.c/all.t*100):0;

  let sectionHtml='';
  const secCards=cards.filter(c=>c.base===false);
  if(secCards.length){
    const base=countFor(cards.filter(c=>c.base!==false));
    const sec=countFor(secCards);
    sectionHtml=`<span>📄 Base <b style="color:var(--teal)">${base.c}/${base.t}</b></span>`+
      `<span>✨ Secretas <b style="color:var(--gold)">${sec.c}/${sec.t}</b></span>`;
  }

  const priceUpdated=(typeof formatPriceUpdatedAt==='function'&&typeof PRICE_UPDATED_AT!=='undefined'&&PRICE_UPDATED_AT.hasOwnProperty(currentSet))
    ? `<span>🗓️ atualizado ${formatPriceUpdatedAt(currentSet)}</span>` : '';

  let chase='';
  if(typeof chaseFor==='function'){
    try{ const c=chaseFor(currentSet); if(c) chase=`<span>💎 chase: ${c}</span>`; }catch(e){}
  }

  // Dica de interação adaptada a touch — no celular não existe "clique",
  // e o texto original ficava sem sentido em telas de toque.
  const isTouch = typeof window.matchMedia==='function' && window.matchMedia('(pointer: coarse)').matches;
  const tip = isTouch ? '👆 toque na carta para editar' : '🖱️ clique na carta para editar slots';

  // #35 (23/07/2026) — link direto pra Lojas & Ofertas filtrado neste set.
  // Só mostra se o set atual está no catálogo real (não em fichários
  // avulsos/legados sem correspondência clara em ml_search_terms.collection).
  const lojasLink = (typeof SET_CATALOG!=='undefined' && SET_CATALOG.some(s=>s.id===currentSet) && typeof fmGoToLojasForSet==='function')
    ? `<span onclick="fmGoToLojasForSet('${currentSet}')" style="cursor:pointer;color:var(--accent);text-decoration:underline">🛍️ ver ofertas deste set</span>` : '';

  infoEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%">
      <span style="font-size:13px;font-weight:800;color:var(--text)">${getSetLabel()}</span>
      <span style="font-size:14px;font-weight:800;color:${pct>=100?'var(--teal)':'var(--gold)'}">${pct}%</span>
      <div style="flex:1;min-width:100px;height:5px;background:var(--surface2);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--teal)':'var(--gold)'};border-radius:3px;transition:width .4s"></div>
      </div>
      <span style="font-size:10px;color:var(--muted)">${all.c}/${all.t} slots</span>
    </div>
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;width:100%;margin-top:6px;font-size:9px;color:var(--muted-oncard,var(--muted))">
      ${sectionHtml}
      ${priceUpdated}
      ${chase}
      ${lojasLink}
      <span style="margin-left:auto">${tip}</span>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────
// #15 — Barra de progresso por secao (Base/Secretas) no fic-set-info
// SUPERADA por fmRebuildSetInfoHeader (#30) — mantida sem uso ativo
// (não é mais chamada em fmAfterRenderBinder) para não quebrar nada
// que ainda referencie o id 'fm-section-progress'.
// ─────────────────────────────────────────────────────────────────
function fmInjectSectionProgress(){
  if(typeof getSetCards!=='function'||typeof currentSet==='undefined') return;
  const infoEl=document.getElementById('fic-set-info');
  if(!infoEl||infoEl.style.display==='none') return;
  const cards=getSetCards();
  function countFor(list){
    let t=0,c=0;
    list.forEach(cd=>{ getSlots(cd,currentSet).forEach(s=>{ t++; if(collected.has(`${currentSet}:${cd.n}:${s.ver}`))c++; }); });
    return {t,c};
  }
  const base=countFor(cards.filter(c=>c.base!==false));
  const sec=countFor(cards.filter(c=>c.base===false));
  if(sec.t===0) return; // sets sem secretas nao precisam do detalhe extra
  const pctB=base.t?Math.round(base.c/base.t*100):0;
  const pctS=sec.t?Math.round(sec.c/sec.t*100):0;
  let bar=document.getElementById('fm-section-progress');
  if(!bar){
    bar=document.createElement('div');
    bar.id='fm-section-progress';
    bar.style.cssText="display:flex;gap:14px;flex-wrap:wrap;width:100%;margin-top:6px;font-size:9px;color:var(--muted);font-family:'Space Mono',monospace";
    infoEl.appendChild(bar);
  }
  bar.innerHTML=`<span>📄 Base: <b style="color:var(--teal)">${base.c}/${base.t}</b> (${pctB}%)</span>
    <span>✨ Secretas: <b style="color:var(--gold)">${sec.c}/${sec.t}</b> (${pctS}%)</span>`;
}

// ─────────────────────────────────────────────────────────────────
// #31 (23/07/2026) — Preço visível direto no card em modo Grade, sem
// precisar de hover (hover não existe em touch — celular nunca via preço
// sem entrar no modal). Canto livre: check(✓) usa top-right externo,
// estrela usa top-right interno, dots de versão usam bottom-left — sobra
// bottom-right pro preço.
// ─────────────────────────────────────────────────────────────────
function fmInjectPriceBadges(){
  if(typeof ficViewMode!=='undefined' && ficViewMode!=='grid') return;
  const wrap=document.getElementById('bwrap');
  if(!wrap||typeof getSetCards!=='function') return;
  const cards=getSetCards();
  wrap.querySelectorAll('.fic-card').forEach(el=>{
    const n=el.dataset.n;
    const card=cards.find(c=>String(c.n)===String(n));
    if(!card||!card.price) return;
    const box=el.firstElementChild;
    if(!box||box.querySelector('.fm-price-badge')) return;
    const b=document.createElement('div');
    b.className='fm-price-badge';
    b.textContent='R$'+(card.price>=100?Math.round(card.price).toLocaleString('pt-BR'):card.price.toFixed(2).replace('.',','));
    b.style.cssText="position:absolute;bottom:3px;right:3px;background:rgba(6,214,160,.92);color:var(--bg);font-size:8px;font-weight:800;padding:1px 4px;border-radius:4px;font-family:'Space Mono',monospace;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.35)";
    box.appendChild(b);
  });
}

// ─────────────────────────────────────────────────────────────────
// #16 — Badge "quase completo" (ex 1/2) no modo Grade
// ─────────────────────────────────────────────────────────────────
function fmInjectAlmostBadges(){
  if(typeof ficViewMode!=='undefined' && ficViewMode!=='grid') return;
  const wrap=document.getElementById('bwrap');
  if(!wrap||typeof getSetCards!=='function') return;
  const cards=getSetCards();
  wrap.querySelectorAll('.fic-card').forEach(el=>{
    const n=el.dataset.n;
    const card=cards.find(c=>String(c.n)===String(n));
    if(!card) return;
    const slots=getSlots(card,currentSet);
    if(slots.length<2) return;
    let colCount=0;
    slots.forEach(s=>{ if(collected.has(`${currentSet}:${card.n}:${s.ver}`)) colCount++; });
    if(colCount===0||colCount===slots.length) return; // ja tratado por 'collected'/cinza
    const box=el.firstElementChild;
    if(!box||box.querySelector('.fm-almost-badge')) return;
    const b=document.createElement('div');
    b.className='fm-almost-badge';
    b.textContent=`${colCount}/${slots.length}`;
    b.style.cssText="position:absolute;top:3px;left:3px;background:rgba(17,138,178,.92);color:#fff;font-size:8px;font-weight:800;padding:1px 4px;border-radius:4px;font-family:'Space Mono',monospace;z-index:2";
    box.appendChild(b);
  });
}

// ─────────────────────────────────────────────────────────────────
// #17 — Atalho "Marcar tudo desta raridade" (respeita busca/filtros atuais)
// ─────────────────────────────────────────────────────────────────
function fmGetFilteredCards(){
  const cards=getSetCards();
  const q=(document.getElementById('bsrch')?.value||'').toLowerCase();
  const oc=document.getElementById('fc')?.checked||false;
  const om=document.getElementById('fm')?.checked||false;
  const oi=document.getElementById('fi2')?.checked||false;
  return cards.filter(c=>{
    if(q&&!(c.name+c.n+(c.type||'')).toLowerCase().includes(q)) return false;
    const slots=getSlots(c,currentSet);
    const hasAny=slots.some(s=>collected.has(`${currentSet}:${c.n}:${s.ver}`));
    const hasAll=slots.every(s=>collected.has(`${currentSet}:${c.n}:${s.ver}`));
    if(oc&&!hasAny) return false;
    if(om&&hasAll) return false;
    if(oi&&!c.important) return false;
    return true;
  });
}
function fmRefreshRarityOptions(){
  const sel=document.getElementById('fm-rarity-select');
  if(!sel) return;
  const cards=fmGetFilteredCards();
  const rarities=[...new Set(cards.map(c=>c.rare).filter(Boolean))].sort();
  const prev=sel.value;
  sel.innerHTML=rarities.map(r=>`<option value="${r}">${r}</option>`).join('')
    ||`<option value="">— sem cartas visíveis —</option>`;
  if(rarities.includes(prev)) sel.value=prev;
}
async function fmBulkMarkRarity(){
  const sel=document.getElementById('fm-rarity-select');
  const rar=sel?.value;
  if(!rar) return;
  const cards=fmGetFilteredCards().filter(c=>c.rare===rar);
  if(!cards.length) return;
  if(!confirm(`Marcar ${cards.length} carta(s) "${rar}" visível(is) como coletadas (todas as versões)?`)) return;
  const btn=document.getElementById('fm-rarity-btn');
  if(btn){ btn.disabled=true; btn.textContent='Marcando…'; }
  for(const c of cards){
    const slots=getSlots(c,currentSet);
    for(const s of slots){
      const key=`${currentSet}:${c.n}:${s.ver}`;
      if(!collected.has(key)) await saveSlot(key,1,[]);
    }
  }
  if(btn){ btn.disabled=false; btn.textContent='✅ Marcar raridade'; }
  renderBinder();
  if(typeof setStatus==='function') setStatus(`${cards.length} carta(s) marcadas como coletadas`,'success');
}
function fmInjectRarityBulk(){
  // CORRIGIDO 23/07/2026: a toolbar virou 2 linhas (.fic-toolbar-row1 = busca/
  // filtros, .fic-toolbar-row2 = modo/ações) dentro do mesmo wrapper .bctl —
  // o select de raridade pertence conceitualmente aos filtros, então vai na
  // row1. A visibilidade continua guiada pelo wrapper .bctl (escondido
  // inteiro nas telas de fichário personalizado), não pela row em si.
  const bctl=document.querySelector('.bctl');
  const row1=document.querySelector('.fic-toolbar-row1');
  if(!bctl||bctl.style.display==='none'||!row1) return;
  if(document.getElementById('fm-rarity-bulk')){ fmRefreshRarityOptions(); return; }
  const box=document.createElement('div');
  box.id='fm-rarity-bulk';
  box.style.cssText='display:flex;gap:6px;align-items:center';
  box.innerHTML=`
    <select id="fm-rarity-select" class="fic-btn" style="max-width:170px"></select>
    <button id="fm-rarity-btn" type="button" class="fic-btn"
      title="Marca como coletadas todas as cartas visíveis (respeitando busca/filtros atuais) dessa raridade">
      ✅ Marcar raridade</button>`;
  row1.appendChild(box);
  box.querySelector('#fm-rarity-btn').addEventListener('click', fmBulkMarkRarity);
  fmRefreshRarityOptions();
}

// ─────────────────────────────────────────────────────────────────
// #18 — Aviso visual quando um set upcoming vira ativo
// ─────────────────────────────────────────────────────────────────
function fmShowToast(msg){
  const t=document.createElement('div');
  t.textContent=msg;
  t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:12px 20px;border-radius:8px;font-size:12px;font-weight:700;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center';
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.transition='opacity .4s'; t.style.opacity='0'; setTimeout(()=>t.remove(),400); },5000);
}
function fmCheckNewlyActiveSets(){
  try{
    if(typeof SET_META==='undefined'||typeof SET_CATALOG==='undefined') return;
    const seenRaw=localStorage.getItem('fm_seen_active_sets');
    const seen=seenRaw?JSON.parse(seenRaw):null;
    const activeIds=[];
    Object.keys(SET_META).forEach(id=>{ if(!SET_META[id].upcoming) activeIds.push(id); });
    SET_CATALOG.forEach(s=>{ if(!s.upcoming && !activeIds.includes(s.id)) activeIds.push(s.id); });
    if(seen===null){
      // primeira execução depois de instalar a feature — não spamma o que já
      // era ativo antes, só registra a "foto" atual como baseline
      localStorage.setItem('fm_seen_active_sets', JSON.stringify(activeIds));
      return;
    }
    const newOnes=activeIds.filter(id=>!seen.includes(id));
    if(newOnes.length){
      newOnes.forEach(id=>{
        const meta=SET_META[id];
        const cat=SET_CATALOG.find(s=>s.id===id);
        const label=meta?.label||cat?.label||id.toUpperCase();
        fmShowToast(`🎉 ${label} já está disponível pra colecionar!`);
      });
      localStorage.setItem('fm_seen_active_sets', JSON.stringify(activeIds));
    }
  }catch(e){}
}

// ─────────────────────────────────────────────────────────────────
// #19 — Duplicar fichário personalizado + #21 — Ordenar Meus Fichários
// ─────────────────────────────────────────────────────────────────
let fmSortMode=localStorage.getItem('fm_binder_sort')||'recent';
function fmSortBinders(){
  if(typeof customBinders==='undefined'||!customBinders) return;
  if(fmSortMode==='progress'){
    customBinders.sort((a,b)=>binderProgress(b)-binderProgress(a));
  }else{
    customBinders.sort((a,b)=> new Date(b.updated_at||b.created_at||0) - new Date(a.updated_at||a.created_at||0));
  }
}
async function fmDuplicateBinder(b){
  if(!confirm(`Duplicar o fichário "${b.name}"?`)) return;
  const copy={
    name:b.name+' (cópia)',
    emoji:b.emoji, layout:b.layout, cover_color:b.cover_color,
    filter_config:b.filter_config?JSON.parse(JSON.stringify(b.filter_config)):{},
    card_ids:b.card_ids?JSON.parse(JSON.stringify(b.card_ids)):[],
  };
  await saveCustomBinder(copy);
  renderCustomBindersHome();
}
// SUPERADA por fmCollapseBinderIconCluster (#32, 23/07/2026) — mantida sem
// uso ativo (não é mais chamada) porque a versão nova já cobre duplicar +
// editar + compartilhar + excluir num só botão. Ver função abaixo.
function fmEnhanceBindersHome(){
  if(typeof customBinders==='undefined'||!customBinders.length) return;
  const nodeList=document.querySelectorAll('#bwrap [onclick^="openCustomBinderView("]');
  nodeList.forEach((card,i)=>{
    const b=customBinders[i];
    if(!b) return;
    const btnRow=Array.from(card.children).find(ch=>ch.style && ch.style.position==='absolute' && ch.style.top==='6px');
    if(!btnRow||btnRow.querySelector('.fm-dup-btn')) return;
    const dup=document.createElement('button');
    dup.className='fm-dup-btn';
    dup.type='button';
    dup.title='Duplicar fichário';
    dup.textContent='⧉';
    dup.style.cssText='background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:2px;opacity:.5;transition:opacity .15s';
    dup.addEventListener('mouseover',()=>dup.style.opacity='1');
    dup.addEventListener('mouseout',()=>dup.style.opacity='.5');
    dup.addEventListener('click',(e)=>{ e.stopPropagation(); fmDuplicateBinder(b); });
    btnRow.insertBefore(dup, btnRow.firstChild);
  });
}

// ─────────────────────────────────────────────────────────────────
// #32 (23/07/2026) — "Meus Fichários" tinha um cluster de até 5 ícones
// minúsculos (pin + editar✏️ + compartilhar🔗 + excluir✕ + duplicar⧉,
// este último injetado por fmEnhanceBindersHome acima) espremidos no canto
// do card, com alvo de toque de ~15-20px — inviável no celular (mínimo
// recomendado é 40px). Substitui o grupo de 4 botões de ação (mantém o pin
// de fora, que é um toggle, não uma ação) por um único botão "⋯" que abre
// um menu (reaproveita as classes .fic-more-menu/.fic-more-item já usadas
// no menu "Mais ações" da toolbar — mesmo tamanho de alvo de toque em mobile).
// ─────────────────────────────────────────────────────────────────
function fmCollapseBinderIconCluster(){
  if(typeof customBinders==='undefined'||!customBinders.length) return;
  const nodeList=document.querySelectorAll('#bwrap [onclick^="openCustomBinderView("]');
  nodeList.forEach((card,i)=>{
    const b=customBinders[i];
    if(!b) return;
    const btnRow=Array.from(card.children).find(ch=>ch.style && ch.style.position==='absolute' && ch.style.top==='6px');
    if(!btnRow||btnRow.dataset.fmCollapsed) return;
    btnRow.dataset.fmCollapsed='1';
    const menuId='fm-card-menu-'+(b.id||i);
    btnRow.innerHTML=`
      <button type="button" class="fic-btn" title="Mais ações do fichário"
        onclick="event.stopPropagation();fmToggleCardMenu('${menuId}')"
        style="padding:2px 8px;font-size:14px;min-width:32px;min-height:32px;line-height:1;border-radius:6px">⋯</button>
      <div id="${menuId}" class="fic-more-menu">
        <button type="button" class="fic-more-item" onclick="event.stopPropagation();fmCloseAllCardMenus();fmDuplicateBinder(${safeJSON(b)})">⧉ Duplicar</button>
        <button type="button" class="fic-more-item" onclick="event.stopPropagation();fmCloseAllCardMenus();openCreateBinderModal(${safeJSON(b)})">✏️ Editar</button>
        <button type="button" class="fic-more-item" onclick="event.stopPropagation();fmCloseAllCardMenus();shareCustomBinderPrompt(${safeJSON(b)})">🔗 Compartilhar</button>
        <button type="button" class="fic-more-item" style="color:var(--accent)" onclick="event.stopPropagation();fmCloseAllCardMenus();deleteCustomBinder('${b.id}')">✕ Excluir</button>
      </div>`;
  });
}
function fmToggleCardMenu(id){
  document.querySelectorAll('.fic-more-menu.open').forEach(m=>{ if(m.id!==id) m.classList.remove('open'); });
  const menu=document.getElementById(id);
  if(menu) menu.classList.toggle('open');
}
function fmCloseAllCardMenus(){
  document.querySelectorAll('.fic-more-menu.open').forEach(m=>m.classList.remove('open'));
}
window.fmToggleCardMenu=fmToggleCardMenu;
window.fmCloseAllCardMenus=fmCloseAllCardMenus;
document.addEventListener('click', function(e){
  if(e.target.closest && e.target.closest('.fic-more-menu, [title="Mais ações do fichário"]')) return;
  fmCloseAllCardMenus();
});
function fmInjectSortControl(){
  if(typeof customBinders==='undefined'||customBinders.length<2) return;
  const header=document.querySelector('#bwrap > div');
  if(!header||document.getElementById('fm-sort-select')) return;
  const sel=document.createElement('select');
  sel.id='fm-sort-select';
  sel.title='Ordenar Meus Fichários';
  sel.style.cssText="padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:10px;font-family:'Space Mono',monospace";
  sel.innerHTML=`<option value="recent">↕ Mais recentes</option><option value="progress">↕ Mais completos</option>`;
  sel.value=fmSortMode;
  sel.addEventListener('change',()=>{
    fmSortMode=sel.value;
    localStorage.setItem('fm_binder_sort', fmSortMode);
    renderCustomBindersHome();
  });
  header.appendChild(sel);
}

// ─────────────────────────────────────────────────────────────────
// #20 — Mini-resumo de progresso por set dentro do fichário personalizado
// ─────────────────────────────────────────────────────────────────
function fmInjectBinderSetSummary(){
  const b=window._cbCurrentBinder;
  if(!b) return;
  const cards=getBinderCards(b);
  if(!cards.length) return;
  const bySet={};
  cards.forEach(c=>{
    if(!bySet[c._setId]) bySet[c._setId]={t:0,c:0};
    const slots=getSlots(c,c._setId);
    bySet[c._setId].t+=slots.length;
    slots.forEach(s=>{ if(collected.has(slotKey(c._setId+':',c.n,s.ver))) bySet[c._setId].c++; });
  });
  const setIds=Object.keys(bySet);
  const grid=document.getElementById('cb-view-grid');
  if(!grid) return;
  const old=document.getElementById('fm-cb-set-summary');
  if(old) old.remove();
  if(setIds.length<2) return; // só faz sentido misturando +1 set
  const box=document.createElement('div');
  box.id='fm-cb-set-summary';
  box.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px';
  box.innerHTML=setIds.map(id=>{
    const {t,c}=bySet[id];
    const pct=t?Math.round(c/t*100):0;
    const lbl=(typeof CB_SET_LABELS!=='undefined'&&CB_SET_LABELS[id])||id.toUpperCase();
    return `<div style="padding:6px 10px;border-radius:6px;background:var(--surface2);border:1px solid var(--border);font-size:9px;font-family:'Space Mono',monospace;color:var(--muted)">
      ${lbl}: <b style="color:var(--teal)">${c}/${t}</b> (${pct}%)</div>`;
  }).join('');
  grid.parentNode.insertBefore(box, grid);
}

// ─────────────────────────────────────────────────────────────────
// #22/#23 — Presets por geração + Pokédex Nacional (usa pokedex_nacional.js)
// ─────────────────────────────────────────────────────────────────
function fmInstallGenPresets(){
  // DESATIVADO 30/07/2026 (bug real reportado pelo Eduardo): esses presets
  // (type:'preset') usam getAllCardsWithSet(), que só busca nas coleções que
  // o usuário tem ATIVAS em myCollections — não no catálogo inteiro — e não
  // têm nenhuma função de "vaga por espécie" (não dá pra clicar e trocar a
  // carta, só listam tudo que bate no filtro). O Master Set Nacional/Regional
  // (fichario_masterdex.js, filter_config.type:'masterdex') resolve os dois
  // problemas: busca em TODAS as ~143 coleções cadastradas e tem o picker de
  // troca por vaga. Manter os dois ativos ao mesmo tempo só confundia — o
  // Eduardo criava um fichário achando que era o Master Set Regional novo,
  // mas caía nesse preset antigo e via "poucas coleções" + "não consigo
  // trocar a carta". Fichários JÁ CRIADOS a partir desses presets antigos
  // continuam funcionando exatamente como antes (não foram tocados) — só
  // paramos de OFERECER esse caminho pra fichário novo.
  return;
  if(typeof BINDER_PRESETS==='undefined'||typeof POKEDEX_NACIONAL==='undefined') return;
  if(BINDER_PRESETS.some(p=>p.key==='fm_pokedex_nacional')) return; // já instalado
  const genColors=['#8E24AA','#E91E63','#BF360C','#673AB7','#FFD700','#00BCD4','#FFC107','#607D8B','#3F51B5'];

  // CORRIGIDO 23/07/2026: geração 1 (Kanto) tinha sido pulada de propósito
  // aqui, achando que 'sv151_pokedex' ('Pokédex 151') já cobria — mas aquele
  // preset só olha pra dentro de UM set (sv3pt5), enquanto os outros presets
  // de geração cruzam TODAS as coleções ativas via speciesFromCardName(). Ou
  // seja, "Kanto" ficava sistematicamente mais fraco que Johto-Paldea (e
  // literalmente zerado se sv3pt5 não estivesse ativa em myCollections) — bug
  // real reportado pelo Eduardo. Agora Kanto entra no mesmo laço que os
  // outros 8, com a mesma lógica cross-coleção. 'Pokédex 151' continua
  // existindo à parte (é diferente: ordem exata de impressão dentro de 1 set
  // só, útil pra quem quer montar o fichário físico da Coleção 151).
  // ATUALIZADO 24/07/2026: antes usava só speciesFromCardName() (casamento por
  // nome — perdia formas/variantes com nome diferente da espécie base e ficava
  // em 824/1025 = 80.4% de cobertura real). Agora que expand_card_database.py
  // trouxe o `dex` real da API pra quase todo o catálogo, fmDexOf(c) usa esse
  // campo primeiro (dado oficial, não adivinhação por texto) e só cai pro
  // casamento por nome nas poucas cartas que ainda não têm `dex` (sets que
  // falharam na API mesmo após 5 tentativas). Cobertura real medida depois
  // dessa troca: 1022/1025 espécies (99,7%) — faltam só #1014/#1021/#1022,
  // prováveis Pokémon de Ascended Heroes (me2pt5/ASC), que ainda não está
  // cadastrado no site (ver [[project_pokemon_tcg]]).
  const genPresets = POKEDEX_GEN_RANGES.map((g,idx)=>({
    key:'fm_gen_'+g.gen,
    name:'Pokédex '+g.label,
    emoji:'🧭',
    desc:`Geração ${g.gen} (${g.label}, #${g.from}-#${g.to}) — 1 carta por espécie que você tiver em qualquer coleção ativa`,
    color:genColors[idx%genColors.length],
    filter:function(c){
      const dex=fmDexOf(c);
      return dex!=null && dex>=g.from && dex<=g.to;
    }
  }));

  // Preset "Pokédex Nacional" — cobertura honesta, não finge 100%.
  const nacionalPreset = {
    key:'fm_pokedex_nacional',
    name:'Pokédex Nacional',
    emoji:'🌐',
    desc:'Todas as 1025 espécies conhecidas — mostra sua cobertura real com as coleções que você tem ativas (não é master set 100%, é o que existe nos sets cadastrados)',
    color:'#118ab2',
    filter:function(c){ return fmDexOf(c)!=null; }
  };

  // Pedido do Eduardo: Nacional + regionais aparecem PRIMEIRO na lista de
  // sugestões temáticas (antes dos presets antigos por tipo/raridade) — em
  // vez de .push() (que joga pro final), usa unshift na ordem certa.
  BINDER_PRESETS.unshift(nacionalPreset, ...genPresets);
}

// ─────────────────────────────────────────────────────────────────
// #34 (23/07/2026) — ✓ de coletado na busca global (#gsearch). Antes a
// busca em todos os sets não dizia se você já tinha a carta — só descobria
// abrindo o fichário daquele set. initGlobalSearch() em app.js monta o
// dropdown #gsearch-dd via innerHTML dentro de um closure `run()` que não é
// global (não dá pra interceptar a chamada direto) — em vez disso, observa
// mudanças no próprio #gsearch-dd com um MutationObserver e injeta o
// selo depois que o HTML já existe. Reaproveita 'collected'/getSlots, os
// mesmos usados no fichário (mesma fonte de verdade).
// ─────────────────────────────────────────────────────────────────
function fmInjectSearchCheckmarks(){
  const dd=document.getElementById('gsearch-dd');
  if(!dd||typeof getSlots!=='function'||typeof collected==='undefined'||typeof SET_CARDS_MAP==='undefined') return;
  dd.querySelectorAll('.gs-item').forEach(el=>{
    if(el.querySelector('.fm-gs-check')) return;
    const onclick=el.getAttribute('onclick')||'';
    const m=onclick.match(/gsGo\('([^']+)','([^']+)'\)/);
    if(!m) return;
    const setId=m[1], n=m[2];
    const cards=SET_CARDS_MAP[setId]?.()||[];
    const card=cards.find(c=>String(parseInt(c.n,10))===String(parseInt(n,10)));
    if(!card) return;
    const slots=getSlots(card,setId);
    if(!slots.length) return;
    const hasAny=slots.some(s=>collected.has(`${setId}:${card.n}:${s.ver}`));
    if(!hasAny) return; // sem selo se não tem nenhuma versão — evita poluir a lista toda
    const allCol=slots.every(s=>collected.has(`${setId}:${card.n}:${s.ver}`));
    const chk=document.createElement('div');
    chk.className='fm-gs-check';
    chk.textContent=allCol?'✓':'½';
    chk.title=allCol?'Você já tem essa carta':'Você tem parte das versões dessa carta';
    chk.style.cssText=`flex-shrink:0;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:800;color:var(--bg);background:${allCol?'var(--teal)':'var(--gold)'};margin-left:6px`;
    el.appendChild(chk);
  });
}
function fmObserveGlobalSearch(){
  const dd=document.getElementById('gsearch-dd');
  if(!dd||dd.__fmObserved) return;
  dd.__fmObserved=true;
  const mo=new MutationObserver(()=>{ try{ fmInjectSearchCheckmarks(); }catch(e){} });
  mo.observe(dd,{childList:true});
}
if(typeof window.initGlobalSearch==='function'){
  const _fmOrigIGS=window.initGlobalSearch;
  window.initGlobalSearch=function(){
    _fmOrigIGS.apply(this, arguments);
    try{ fmObserveGlobalSearch(); }catch(e){}
  };
}

// ─────────────────────────────────────────────────────────────────
// #35 (23/07/2026) — link Fichário → Lojas & Ofertas, filtrado no set atual.
// ml_search_terms.collection é texto livre digitado pelo Eduardo (skill
// mydeck-cadastrar-produto-ml) e não bate 1:1 com o id interno do set — mas
// segue de perto o nome em português usado em SET_CATALOG (ex: label
// "ME04(CRI) — Caos Ascendente" → collection "Caos Ascendente"). Por isso o
// match é por normalização (sem acento/maiúscula) + substring, não por id
// exato — e só aplica o filtro nos valores que realmente existem no DOM
// depois de renderLojas(), nunca inventando uma coleção que não foi
// cadastrada ainda.
// ─────────────────────────────────────────────────────────────────
function fmNormalizeStr(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
}
function fmGoToLojasForSet(setId){
  if(typeof SET_CATALOG==='undefined') return;
  const set=SET_CATALOG.find(s=>s.id===setId);
  if(!set) return;
  const friendly=(set.label.split('—')[1]||set.label).trim();
  const target=fmNormalizeStr(friendly);

  const tabEl=[...document.querySelectorAll('.tabs .tab')].find(t=>(t.getAttribute('onclick')||'').includes("'lojas'"));
  if(typeof go==='function'&&tabEl) go('lojas',tabEl);

  let tries=0;
  const tryFilter=()=>{
    tries++;
    const cards=document.querySelectorAll('#lojas-showcase .product-card[data-collection]');
    if(!cards.length){ if(tries<20) setTimeout(tryFilter,150); return; }
    const values=new Set();
    cards.forEach(c=>values.add(c.getAttribute('data-collection')));
    let best=null;
    values.forEach(v=>{
      const nv=fmNormalizeStr(v);
      if(!best && (nv===target||nv.includes(target)||target.includes(nv))) best=v;
    });
    if(!best){
      if(typeof fmShowToast==='function') fmShowToast(`Ainda não há ofertas cadastradas pra "${friendly}"`);
      return;
    }
    const bar=document.querySelector('#lojas-showcase .collection-filter-bar');
    const btn=bar?Array.from(bar.querySelectorAll('.filter-chip')).find(b=>b.getAttribute('data-filter')===best):null;
    if(typeof filterLojasByCollection==='function') filterLojasByCollection(best, btn||null);
    document.getElementById('lojas-showcase')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  setTimeout(tryFilter, 200);
}
window.fmGoToLojasForSet=fmGoToLojasForSet;

// ─────────────────────────────────────────────────────────────────
// #36 (23/07/2026) — card de impacto no Patrimônio: "se você completar os
// fichários ativos, sua coleção valeria +R$X". Cruza dados que já existem
// mas nunca se falavam — preço das cartas faltantes (Fichário) x painel de
// Patrimônio (Dashboard). Pendurado em updateDashProgress() porque essa
// função já roda tanto ao abrir a Dashboard quanto a cada render do
// Fichário (fichario_patch.js chama ela em toda renderBinder()) — então
// o card fica sempre atualizado, mesmo sem o usuário abrir a Dashboard.
// ─────────────────────────────────────────────────────────────────
function fmInjectPatrimonioImpact(){
  const host=document.getElementById('chart-patrimonio');
  if(!host||typeof getAllCardsWithSet!=='function'||typeof getSlots!=='function'||typeof collected==='undefined') return;
  const parent=host.parentElement;
  if(!parent) return;
  const all=getAllCardsWithSet();
  if(!all.length) return;
  let missingValue=0, missingCount=0, ownedValue=0;
  all.forEach(c=>{
    const slots=getSlots(c,c._setId);
    slots.forEach(s=>{
      const v=c.price||0;
      if(collected.has(`${c._setId}:${c.n}:${s.ver}`)) ownedValue+=v;
      else { missingValue+=v; missingCount++; }
    });
  });
  let box=document.getElementById('fm-patrimonio-impact');
  if(missingCount===0){ if(box) box.remove(); return; } // já completou tudo que tem ativo
  if(!box){
    box=document.createElement('div');
    box.id='fm-patrimonio-impact';
    box.style.cssText="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-family:'Space Mono',monospace;font-size:11px;display:flex;gap:18px;flex-wrap:wrap;align-items:center";
    parent.appendChild(box);
  }
  box.innerHTML=`<span>💰 Se completar os fichários ativos: <b style="color:var(--teal)">+R$${fmtR(missingValue)}</b></span>
    <span style="color:var(--muted)">${missingCount} slots faltando · valor já coletado R$${fmtR(ownedValue)}</span>`;
}
if(typeof window.updateDashProgress==='function'){
  const _fmOrigUDP=window.updateDashProgress;
  window.updateDashProgress=function(){
    _fmOrigUDP.apply(this, arguments);
    try{ fmInjectPatrimonioImpact(); }catch(e){}
  };
}

// ─────────────────────────────────────────────────────────────────
// #37 (23/07/2026) — "cartão de progresso" em PNG pra compartilhar (ex:
// grupo do WhatsApp). Reaproveita o MESMO padrão canvas de
// downloadVendaImage()/roundRectPath() (app.js) — cores, fontes e o
// esquema de download via canvas.toBlob()+<a download> já validados ali,
// só desenhando um layout diferente (progresso de set, não cartas à venda).
// Chamado pelo item novo no menu "⋯ Mais ações" (#fic-progress-card, index.html).
// ─────────────────────────────────────────────────────────────────
async function fmDownloadProgressCard(){
  if(typeof getSetCards!=='function'||typeof currentSet==='undefined'||typeof roundRectPath!=='function'){
    alert('Recurso indisponível neste momento.'); return;
  }
  if(currentSet==='__custom__'){ alert('Abra um set específico do Fichário pra gerar o cartão de progresso.'); return; }
  try{
    if(document.fonts&&document.fonts.ready) await document.fonts.ready;
    const cards=getSetCards();
    let total=0,col=0;
    cards.forEach(c=>{ getSlots(c,currentSet).forEach(s=>{ total++; if(collected.has(`${currentSet}:${c.n}:${s.ver}`))col++; }); });
    const pct=total?Math.round(col/total*100):0;
    const chase=(typeof chaseFor==='function')?(chaseFor(currentSet)||''):'';
    const label=(typeof getSetLabel==='function')?getSetLabel():currentSet;

    const cw=680, ch=360, pad=28;
    const canvas=document.createElement('canvas');
    canvas.width=cw; canvas.height=ch;
    const ctx=canvas.getContext('2d');

    // fundo
    const bgGrad=ctx.createLinearGradient(0,0,0,ch);
    bgGrad.addColorStop(0,'#141726'); bgGrad.addColorStop(1,'#0a0b10');
    ctx.fillStyle=bgGrad; ctx.fillRect(0,0,cw,ch);

    ctx.fillStyle='#ffd166';
    ctx.font="700 20px 'Bebas Neue', sans-serif";
    ctx.textBaseline='top';
    ctx.fillText('MEU PROGRESSO — MYDECK TCG', pad, pad-6);

    ctx.fillStyle='#fff';
    ctx.font="700 30px 'Bebas Neue', sans-serif";
    ctx.fillText(String(label).slice(0,42), pad, pad+34);

    // % gigante à direita
    const pctColor=pct>=100?'#06d6a0':'#ffd166';
    ctx.fillStyle=pctColor;
    ctx.font="700 96px 'Bebas Neue', sans-serif";
    ctx.textAlign='right';
    ctx.fillText(pct+'%', cw-pad, pad+40);
    ctx.textAlign='left';

    // barra de progresso
    const barY=pad+150, barW=cw-pad*2, barH=16;
    roundRectPath(ctx,pad,barY,barW,barH,8);
    ctx.fillStyle='#242840'; ctx.fill();
    roundRectPath(ctx,pad,barY,Math.max(barH,barW*pct/100),barH,8);
    ctx.fillStyle=pctColor; ctx.fill();

    ctx.fillStyle='#c7cbe0';
    ctx.font="700 18px 'Space Mono', monospace";
    ctx.fillText(`${col}/${total} slots coletados`, pad, barY+34);

    if(chase){
      ctx.fillStyle='#118ab2';
      ctx.font="700 15px 'Space Mono', monospace";
      ctx.fillText('💎 Chase: '+chase, pad, barY+64);
    }

    ctx.fillStyle='#565d74';
    ctx.font="14px 'Space Mono', monospace";
    ctx.fillText('mydecktcg.com.br', pad, ch-pad-14);

    const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));
    if(!blob) throw new Error('toBlob retornou vazio');
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`mydeck-progresso-${currentSet}-${Date.now()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }catch(e){
    console.error('[fmDownloadProgressCard] falha ao exportar PNG:', e);
    alert('Não foi possível gerar a imagem agora. Tenta de novo em alguns segundos.');
  }
}
window.fmDownloadProgressCard=fmDownloadProgressCard;

// ─────────────────────────────────────────────────────────────────
// #38 (23/07/2026) — ponte com o EV Calculator: cruza o valor de mercado
// das cartas que faltam neste set (Fichário) com o preço de booster do
// mesmo set no CATALOG do ev_calculator.js — "faltam R$X em cartas, dá
// pra comprar ~N boosters com isso". Ajuda a decidir singles vs. abrir
// booster. Só aparece se o set atual tiver produto cadastrado no CATALOG
// (sets sem preço de varejo confirmado simplesmente não mostram nada, em
// vez de inventar um número).
// ─────────────────────────────────────────────────────────────────
function fmMissingValueForSet(setId){
  if(typeof SET_CARDS_MAP==='undefined'||typeof getSlots!=='function'||typeof collected==='undefined') return 0;
  const cards=SET_CARDS_MAP[setId]?.()||[];
  let v=0;
  cards.forEach(c=>{ getSlots(c,setId).forEach(s=>{ if(!collected.has(`${setId}:${c.n}:${s.ver}`)) v+=(c.price||0); }); });
  return v;
}
function fmInjectEvBridge(){
  if(typeof currentSet==='undefined'||currentSet==='__custom__'||typeof CATALOG==='undefined') return;
  const infoEl=document.getElementById('fic-set-info');
  if(!infoEl||infoEl.style.display==='none') return;
  const entries=CATALOG.filter(p=>p.set===currentSet && p.boosters>0 && p.varejo>0);
  const existing=document.getElementById('fm-ev-bridge');
  if(!entries.length){ if(existing) existing.remove(); return; } // set sem produto cadastrado — não inventa número

  const cheapestPerBooster=Math.min(...entries.map(p=>p.varejo/p.boosters));
  const missingValue=fmMissingValueForSet(currentSet);
  if(missingValue<=0){ if(existing) existing.remove(); return; } // já completou

  const boostersEquiv=Math.max(1,Math.round(missingValue/cheapestPerBooster));
  let row=existing;
  if(!row){
    row=document.createElement('div');
    row.id='fm-ev-bridge';
    row.style.cssText="display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%;margin-top:6px;font-size:9px;color:var(--muted-oncard,var(--muted))";
    infoEl.appendChild(row);
  }
  row.innerHTML=`<span>📦 faltam <b style="color:var(--gold)">R$${fmtR(missingValue)}</b> em cartas — dá pra comprar <b style="color:var(--accent)">~${boostersEquiv} booster${boostersEquiv===1?'':'s'}</b> desse set com esse valor (R$${cheapestPerBooster.toFixed(2).replace('.',',')}/un.)</span>`;
}

// ─────────────────────────────────────────────────────────────────
// #43 (24/07/2026) — Número da Pokédex nas cartas + ordenar por Dex.
// expand_card_database.py agora preenche `dex` (Pokédex nacional REAL, vindo
// da API oficial) em quase todas as cartas cadastradas — mais preciso que o
// casamento por nome (speciesFromCardName, usado pelos presets de geração
// desde a Pokédex Nacional) porque não depende de bater texto do nome.
// fmDexOf() usa o campo real quando existe e cai pro casamento por nome só
// pras cartas que ainda não têm `dex` (os 3 sets que falharam na API mesmo
// depois de 5 tentativas — ver ANALISE_FICHARIO_PROFISSIONAL_23jul2026.md /
// scripts/legacy_queue.json status:"erro").
// ─────────────────────────────────────────────────────────────────
function fmDexOf(c){
  if(c && c.dex!=null && c.dex!==''){
    const n=parseInt(String(c.dex).split(',')[0],10);
    if(!isNaN(n)) return n;
  }
  if(typeof speciesFromCardName==='function'){
    const sp=speciesFromCardName(c.name);
    if(sp) return sp.dex;
  }
  return null;
}
// CORRIGIDO 24/07/2026: fmDexOf() nunca era exposta em window — como
// fichario_masterdex.js é um IIFE separado, ele não enxergava essa função
// (só o que é atribuído a window cruza a fronteira entre os dois arquivos).
// O guard `typeof fmDexOf==='function'` lá falhava em silêncio (sem erro no
// console), então TODA carta do catálogo era pulada e o Master Set Nacional
// nunca achava candidato nenhum — nem pro Bulbasaur (#1), reportado pelo
// Eduardo como "0/1025 vagas preenchidas" e picker sempre vazio.
window.fmDexOf = fmDexOf;

function fmInjectDexBadges(){
  if(typeof ficViewMode!=='undefined' && ficViewMode!=='grid') return;
  const wrap=document.getElementById('bwrap');
  if(!wrap||typeof getSetCards!=='function') return;
  const cards=getSetCards();
  wrap.querySelectorAll('.fic-card').forEach(el=>{
    const n=el.dataset.n;
    const card=cards.find(c=>String(c.n)===String(n));
    if(!card) return;
    const dex=fmDexOf(card);
    if(dex==null) return;
    const box=el.firstElementChild;
    if(!box||box.querySelector('.fm-dex-badge')) return;
    // CORRIGIDO na revisão 24/07: top:3px;right:3px colidia visualmente com o
    // ★ de "importante" (top:3px;right:4px, quando não coletada) e com o ✓ de
    // completa (top:-7px;right:-7px). Empilha acima do badge de preço
    // (bottom:3px;right:3px) em vez de disputar o canto superior direito.
    const b=document.createElement('div');
    b.className='fm-dex-badge';
    b.textContent='#'+dex;
    b.style.cssText="position:absolute;bottom:15px;right:3px;background:rgba(255,255,255,.92);color:#111;font-size:8px;font-weight:800;padding:1px 4px;border-radius:4px;font-family:'Space Mono',monospace;z-index:2";
    box.appendChild(b);
  });
}

let fmSortByDex = localStorage.getItem('fm_sort_by_dex')==='1';
function fmApplyDexSort(){
  const btn=document.getElementById('fm-dexsort-btn');
  if(btn){
    btn.style.color = fmSortByDex ? 'var(--gold)' : 'var(--muted)';
    btn.style.borderColor = fmSortByDex ? 'var(--gold)' : 'var(--border)';
  }
  if(typeof ficViewMode!=='undefined' && ficViewMode!=='grid') return; // só faz sentido na Grade
  const wrap=document.getElementById('bwrap');
  if(!wrap||typeof getSetCards!=='function'||!fmSortByDex) return;
  const cards=getSetCards();
  wrap.querySelectorAll('.bgrid').forEach(grid=>{
    const els=[...grid.children];
    els.sort((a,b)=>{
      const ca=cards.find(c=>String(c.n)===String(a.dataset.n));
      const cb=cards.find(c=>String(c.n)===String(b.dataset.n));
      const da=ca?fmDexOf(ca):null, db=cb?fmDexOf(cb):null;
      if(da==null&&db==null) return 0;
      if(da==null) return 1;
      if(db==null) return -1;
      return da-db;
    });
    els.forEach(el=>grid.appendChild(el));
  });
}
function fmToggleDexSort(){
  fmSortByDex=!fmSortByDex;
  localStorage.setItem('fm_sort_by_dex', fmSortByDex?'1':'0');
  fmApplyDexSort();
}
window.fmToggleDexSort=fmToggleDexSort;
function fmInjectDexSortControl(){
  // Mesmo guard que fmInjectRarityBulk usa: não injeta se a toolbar (.bctl)
  // estiver escondida (telas de fichário personalizado/compartilhado, que
  // também podem passar por renderBinder() em certos fluxos).
  const bctl=document.querySelector('.bctl');
  if(!bctl||bctl.style.display==='none') return;
  const row2=document.querySelector('.fic-toolbar-row2');
  if(!row2) return;
  let btn=document.getElementById('fm-dexsort-btn');
  if(!btn){
    btn=document.createElement('button');
    btn.id='fm-dexsort-btn';
    btn.type='button';
    btn.className='fic-btn';
    btn.title='Reordena as cartas visíveis pelo número da Pokédex nacional em vez do número do set';
    btn.textContent='🔢 Ordenar por Dex';
    btn.onclick=fmToggleDexSort;
    const firstBlock=row2.firstElementChild;
    if(firstBlock) row2.insertBefore(btn, firstBlock.nextSibling);
    else row2.appendChild(btn);
  }
  fmApplyDexSort();
}

// ─────────────────────────────────────────────────────────────────
// #44 (24/07/2026) — Filtro por artista/ilustrador dentro do fichário.
// Responde a pergunta original do Eduardo ("dá pra montar fichário só de um
// artista?") — filtro visual dentro do set aberto (esconde as cartas que não
// são daquele ilustrador). É um filtro de exibição, igual às badges: não
// reconta os %/slots do cabeçalho, que continuam refletindo o set inteiro.
// ─────────────────────────────────────────────────────────────────
let fmArtistFilter = '';
function fmRefreshArtistOptions(){
  const sel=document.getElementById('fm-artist-select');
  if(!sel||typeof getSetCards!=='function') return;
  const cards=getSetCards();
  const artists=[...new Set(cards.map(c=>c.artist).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(!artists.length){ sel.style.display='none'; fmArtistFilter=''; return; }
  sel.style.display='';
  const prev=fmArtistFilter;
  sel.innerHTML='<option value="">🎨 Todos os artistas</option>'+
    artists.map(a=>`<option value="${a.replace(/"/g,'&quot;')}">${a}</option>`).join('');
  sel.value = artists.includes(prev) ? prev : '';
  fmArtistFilter = sel.value;
}
function fmApplyArtistFilter(){
  const wrap=document.getElementById('bwrap');
  if(!wrap||typeof getSetCards!=='function') return;
  if(!fmArtistFilter){
    wrap.querySelectorAll('.fic-card').forEach(el=>{ el.style.display=''; });
    return;
  }
  const cards=getSetCards();
  wrap.querySelectorAll('.fic-card').forEach(el=>{
    const card=cards.find(c=>String(c.n)===String(el.dataset.n));
    el.style.display = (card && card.artist===fmArtistFilter) ? '' : 'none';
  });
}
function fmOnArtistChange(){
  const sel=document.getElementById('fm-artist-select');
  fmArtistFilter=sel?sel.value:'';
  fmApplyArtistFilter();
}
window.fmOnArtistChange=fmOnArtistChange;
function fmInjectArtistFilter(){
  const bctl=document.querySelector('.bctl');
  if(!bctl||bctl.style.display==='none') return;
  const row1=document.querySelector('.fic-toolbar-row1');
  if(!row1) return;
  let sel=document.getElementById('fm-artist-select');
  if(!sel){
    sel=document.createElement('select');
    sel.id='fm-artist-select';
    sel.className='fic-btn';
    sel.style.maxWidth='190px';
    sel.onchange=fmOnArtistChange;
    row1.appendChild(sel);
  }
  fmRefreshArtistOptions();
  fmApplyArtistFilter();
}

// ─────────────────────────────────────────────────────────────────
// #45 (24/07/2026) — Relatório "Meus Artistas": cruza `collected` com o
// campo `artist` de TODAS as coleções cadastradas (SET_CARDS_MAP inteiro),
// não só o fichário aberto no momento. O modal é criado dinamicamente e
// reaproveita as classes .ov/.modal já existentes no style.css — evita
// editar index.html de novo pra isso.
// ─────────────────────────────────────────────────────────────────
function fmBuildArtistStats(){
  const stats={};
  if(typeof SET_CARDS_MAP==='undefined') return stats;
  Object.keys(SET_CARDS_MAP).forEach(setId=>{
    let cards=[];
    try{ cards=SET_CARDS_MAP[setId]()||[]; }catch(e){ return; }
    cards.forEach(c=>{
      if(!c.artist) return;
      if(!stats[c.artist]) stats[c.artist]={owned:0,total:0};
      stats[c.artist].total++;
      let owned=false;
      try{
        const slots=(typeof getSlots==='function')?getSlots(c,setId):[{ver:'N'}];
        owned=slots.some(s=>collected.has(`${setId}:${c.n}:${s.ver}`));
      }catch(e){}
      if(owned) stats[c.artist].owned++;
    });
  });
  return stats;
}

// ─────────────────────────────────────────────────────────────────
// Fichário PERSISTENTE por artista (24/07/2026) — antes só existia o filtro
// dentro de 1 set (item #44) e o relatório read-only acima (#45). Eduardo
// pediu de novo, mais explícito: "dá pra fazer no site o fichário por
// artista?" — ou seja, um fichário de verdade (salvo, cross-coleção,
// acompanha progresso), não só um filtro temporário. Reaproveita o mesmo
// mecanismo do Master Set Nacional (custom_binders + filter_config.type
// novo), mas SEM estado por vaga: é 100% dinâmico (como um preset), porque
// "essa carta é ou não é desse artista" não precisa de escolha manual —
// só filtra `c.artist===cfg.artist` em TODO o catálogo (não só myCollections,
// senão um artista com cartas só em coleção legada nunca apareceria).
// ─────────────────────────────────────────────────────────────────
function fmFindArtistBinder(artist){
  if(typeof customBinders==='undefined') return null;
  return customBinders.find(b=>b.filter_config&&b.filter_config.type==='artist'&&b.filter_config.artist===artist)||null;
}
async function fmCreateArtistBinder(encodedArtist){
  const artist=decodeURIComponent(encodedArtist);
  const existing=fmFindArtistBinder(artist);
  if(existing){ closeModal('martists'); if(typeof openCustomBinderView==='function') openCustomBinderView(existing); return; }
  if(typeof saveCustomBinder!=='function'){ return; }
  const payload={
    name:'🎨 '+artist, emoji:'🎨', layout:3,
    filter_config:{type:'artist',artist}, card_ids:[], cover_color:'#a855f7'
  };
  const saved=await saveCustomBinder(payload);
  if(saved){ closeModal('martists'); openCustomBinderView(saved); }
  else alert('Erro ao criar — confira se está logado.');
}
window.fmCreateArtistBinder=fmCreateArtistBinder;

// getBinderCards: resolve filter_config.type==='artist' varrendo TODO o
// catálogo (SET_CARDS_MAP inteiro), igual ao Master Set Nacional faz.
if(typeof window.getBinderCards==='function'){
  const _fmOrigGetBinderCardsArtist=window.getBinderCards;
  window.getBinderCards=function(binder){
    const cfg=(binder&&binder.filter_config)||{};
    if(cfg.type==='artist'&&typeof SET_CARDS_MAP!=='undefined'){
      const out=[];
      Object.keys(SET_CARDS_MAP).forEach(setId=>{
        let cards=[];
        try{ cards=SET_CARDS_MAP[setId]()||[]; }catch(e){ return; }
        cards.forEach(c=>{ if(c.artist===cfg.artist) out.push({...c,_setId:setId}); });
      });
      return out;
    }
    return _fmOrigGetBinderCardsArtist.apply(this,arguments);
  };
}
function fmEnsureArtistsModal(){
  if(document.getElementById('martists')) return;
  const ov=document.createElement('div');
  ov.className='ov';
  ov.id='martists';
  ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('martists'); });
  ov.innerHTML=`<div class="modal modal-wide" style="max-height:85vh;overflow-y:auto">
    <button class="mc-btn" onclick="closeModal('martists')">✕</button>
    <div id="martists-content"></div>
  </div>`;
  document.body.appendChild(ov);
}
function fmOpenArtistsReport(){
  if(typeof SET_CARDS_MAP==='undefined'){ if(typeof setStatus==='function') setStatus('Dados de coleções ainda carregando, tenta de novo em 1s','error'); return; }
  fmEnsureArtistsModal();
  const stats=fmBuildArtistStats();
  const entries=Object.entries(stats).sort((a,b)=> b[1].owned-a[1].owned || b[1].total-a[1].total || a[0].localeCompare(b[0],'pt-BR'));
  const totalArtists=entries.length;
  const withAny=entries.filter(([,v])=>v.owned>0).length;
  const rows=entries.map(([name,v])=>{
    const pct=v.total?Math.round(v.owned/v.total*100):0;
    const already=fmFindArtistBinder(name);
    return `<tr>
      <td style="padding:5px 8px;color:var(--text)">${name}</td>
      <td style="padding:5px 8px;text-align:right;color:var(--teal);font-weight:700">${v.owned}</td>
      <td style="padding:5px 8px;text-align:right;color:var(--muted)">${v.total}</td>
      <td style="padding:5px 8px;text-align:right;color:${pct>=50?'var(--teal)':'var(--gold)'}">${pct}%</td>
      <td style="padding:5px 8px;text-align:right">
        <button data-artist="${encodeURIComponent(name)}" onclick="fmCreateArtistBinder(this.dataset.artist)"
          style="background:none;border:1px solid var(--border);border-radius:5px;color:${already?'var(--teal)':'var(--accent)'};
                 cursor:pointer;font-size:9px;padding:3px 7px;font-family:'Space Mono',monospace;white-space:nowrap">
          ${already?'📂 abrir fichário':'+ criar fichário'}</button>
      </td>
    </tr>`;
  }).join('');
  const content=document.getElementById('martists-content');
  if(!content) return;
  content.innerHTML=`
    <h3 style="margin:0 0 4px">🎨 Meus Artistas</h3>
    <p style="font-size:11px;color:var(--muted);margin:0 0 12px;line-height:1.5">
      Quantas cartas você já tem de cada ilustrador, considerando todas as coleções cadastradas no site.
      Cartas sem dado de artista ainda (alguns sets legados que falharam na API) não entram nessa conta.
      <b style="color:var(--teal)">${withAny}</b> de <b>${totalArtists}</b> artistas com pelo menos 1 carta sua.
    </p>
    <div style="max-height:60vh;overflow-y:auto">
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border)">
        <th style="padding:5px 8px">Artista</th>
        <th style="padding:5px 8px;text-align:right">Suas</th>
        <th style="padding:5px 8px;text-align:right">Existem</th>
        <th style="padding:5px 8px;text-align:right">%</th>
        <th style="padding:5px 8px"></th>
      </tr></thead>
      <tbody>${rows||'<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--muted)">Nenhum dado de artista disponível ainda.</td></tr>'}</tbody>
    </table>
    </div>`;
  openModal('martists');
}
window.fmOpenArtistsReport=fmOpenArtistsReport;

// ─────────────────────────────────────────────────────────────────
// QUICK-TOGGLE nos "dots de versão" (estilo pkmn.gg) — clicar direto
// no marcador colorido de uma versão marca/desmarca 1 cópia daquela
// versão na hora, sem abrir o modal. Clicar em qualquer outra parte
// do card continua abrindo o modal completo (pra qty>1/origem etc).
// ─────────────────────────────────────────────────────────────────
// CORRIGIDO 30/07/2026 (pedido do Eduardo: "quero em todos" — fichário
// oficial E personalizado/fixado): antes dependia de `currentSet`/
// `getSetCards()`, então só existia na aba de UM set oficial por vez. Agora
// lê `data-setid` direto do próprio card (todo `.fic-card` carrega isso desde
// a unificação de tamanho/funções — ver [[project_pokemon_tcg]]) e acha o
// wrapper dos dots pelo atributo `data-dotswrap` (estável, não pelo texto do
// style) — funciona em QUALQUER `.fic-card` na tela, seja fichário oficial ou
// personalizado. Não se aplica ao Master Set/regional (lá cada vaga mostra 1
// carta escolhida por espécie, sem conceito de "versão" pra marcar aqui).
// CORRIGIDO 30/07/2026 — BUG REAL achado nesta revisão (não reportado pelo
// Eduardo, achado auditando o código): esta função chamava `toggleSlot(key)`,
// que NUNCA existiu em lugar nenhum do projeto — o guard `typeof toggleSlot
// ==='function'` sempre dava falso, então clicar no quadradinho não fazia
// ABSOLUTAMENTE NADA, silenciosamente (sem erro no console, sem nada). Trocado
// por `fmQuickToggleDot()`, que usa `saveSlot()` (a mesma função real que o
// modal completo usa) — liga/desliga 1 cópia daquela versão de verdade.
async function fmQuickToggleDot(setId, n, ver){
  const key = `${setId}:${n}:${ver}`;
  const already = collected.has(key) || (typeof ficCollection!=='undefined' && ficCollection[key]?.qty>0);
  if (typeof saveSlot !== 'function') return;
  await saveSlot(key, already?0:1, []);
  if (typeof updateDashProgress==='function') updateDashProgress();
  // Re-renderiza a view certa: dentro de um fichário personalizado/fixado usa
  // o refresh próprio dele (preserva busca/filtro); no fichário oficial usa
  // renderBinder() — mesmo padrão de onSaved já usado em openSlotModal.
  if (window._cbCurrentBinder && typeof window._cbRefreshGrid==='function') window._cbRefreshGrid();
  else if (typeof renderBinder==='function') renderBinder();
}
window.fmQuickToggleDot = fmQuickToggleDot;

// CORRIGIDO 30/07/2026 (pedido do Eduardo: "quero em todos" — fichário
// oficial E personalizado/fixado): antes dependia de `currentSet`/
// `getSetCards()`, então só existia na aba de UM set oficial por vez. Agora
// lê `data-setid` direto do próprio card (todo `.fic-card` carrega isso desde
// a unificação de tamanho/funções — ver [[project_pokemon_tcg]]) e acha o
// wrapper dos dots pelo atributo `data-dotswrap` (estável, não pelo texto do
// style) — funciona em QUALQUER `.fic-card` na tela, seja fichário oficial ou
// personalizado. Não se aplica ao Master Set/regional (lá cada vaga mostra 1
// carta escolhida por espécie, sem conceito de "versão" pra marcar aqui).
function fmInjectQuickToggleDots(){
  if (typeof ficViewMode !== 'undefined' && ficViewMode !== 'grid') return; // só existe na grid
  const wrap = document.getElementById('bwrap');
  if (!wrap) return;
  wrap.querySelectorAll('.fic-card[data-setid]').forEach(cardEl => {
    const n = cardEl.dataset.n;
    const setId = cardEl.dataset.setid;
    if (n === undefined || n === null || !setId) return;
    const dotsWrap = cardEl.querySelector('[data-dotswrap]');
    if (!dotsWrap || dotsWrap.__fmWired) return;
    dotsWrap.__fmWired = true;
    dotsWrap.querySelectorAll('[data-ver]').forEach(dotEl => {
      const ver = dotEl.dataset.ver;
      if (!ver) return;
      dotEl.style.cursor = 'pointer';
      dotEl.addEventListener('click', function(e){
        e.stopPropagation();
        fmQuickToggleDot(setId, n, ver);
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// WIRING — monkey-patch das funções globais, na ordem certa
// ─────────────────────────────────────────────────────────────────
function fmAfterRenderBinder(){
  try{ fmRebuildSetInfoHeader(); }catch(e){}
  try{ fmInjectEvBridge(); }catch(e){}
  try{ fmInjectAlmostBadges(); }catch(e){}
  try{ fmInjectPriceBadges(); }catch(e){}
  try{ fmInjectDexBadges(); }catch(e){}
  try{ fmInjectRarityBulk(); }catch(e){}
  try{ fmInjectDexSortControl(); }catch(e){}
  try{ fmInjectArtistFilter(); }catch(e){}
  try{ fmInjectQuickToggleDots(); }catch(e){}
}
if(typeof window.renderBinder==='function'){
  const _fmOrigRenderBinder=window.renderBinder;
  window.renderBinder=function(){
    _fmOrigRenderBinder.apply(this, arguments);
    fmAfterRenderBinder();
  };
}
// os filtros de busca/checkbox chamam renderBinder() via oninput/onchange no
// HTML — já cobertos pelo wrapper acima. Mas a busca de raridade precisa
// atualizar as opções do <select> quando o texto muda, sem re-marcar nada:
document.addEventListener('input', function(e){
  if(e.target && (e.target.id==='bsrch')) fmRefreshRarityOptions();
});
document.addEventListener('change', function(e){
  if(e.target && (e.target.id==='fc'||e.target.id==='fm'||e.target.id==='fi2')) fmRefreshRarityOptions();
});

if(typeof window.renderCustomBindersHome==='function'){
  const _fmOrigRCBH=window.renderCustomBindersHome;
  window.renderCustomBindersHome=function(){
    fmSortBinders();
    _fmOrigRCBH.apply(this, arguments);
    try{ fmCollapseBinderIconCluster(); }catch(e){}
    try{ fmInjectSortControl(); }catch(e){}
  };
}

if(typeof window.openCustomBinderView==='function'){
  const _fmOrigOCBV=window.openCustomBinderView;
  window.openCustomBinderView=function(){
    _fmOrigOCBV.apply(this, arguments);
    try{ fmInjectBinderSetSummary(); }catch(e){}
    // NOVO 30/07/2026 (pedido do Eduardo: "quero em todos"): quadradinhos de
    // marcar versão direto no card, agora também no fichário personalizado
    // (só não se aplica ao Master Set/regional, que não passa por aqui — ver
    // fichario_masterdex.js, tem UI própria de 1 carta por vaga).
    try{ fmInjectQuickToggleDots(); }catch(e){}
  };
  // _cbRefreshGrid (busca dentro do fichário personalizado) é reatribuída a
  // cada abertura — reaplica o resumo depois de cada refresh de filtro também
  const _fmWrapRefreshGrid=function(){
    if(typeof window._cbRefreshGrid==='function' && !window._cbRefreshGrid.__fmWrapped){
      const _origRefresh=window._cbRefreshGrid;
      window._cbRefreshGrid=function(){ _origRefresh.apply(this,arguments); try{fmInjectBinderSetSummary();}catch(e){} try{fmInjectQuickToggleDots();}catch(e){} };
      window._cbRefreshGrid.__fmWrapped=true;
    }
  };
  const _fmOrigOCBV2=window.openCustomBinderView;
  window.openCustomBinderView=function(){
    _fmOrigOCBV2.apply(this, arguments);
    setTimeout(_fmWrapRefreshGrid, 0);
  };
}

// Presets de geração + Pokédex Nacional — instala assim que os dados
// (pokedex_nacional.js) e BINDER_PRESETS (app.js) estiverem disponíveis.
fmInstallGenPresets();

// Aviso de set upcoming->ativo — roda 1x no carregamento da página, com um
// pequeno atraso pra dar tempo de myCollections/SET_META estarem prontos.
document.addEventListener('DOMContentLoaded', function(){ setTimeout(fmCheckNewlyActiveSets, 1500); });
if(document.readyState==='complete'||document.readyState==='interactive'){
  setTimeout(fmCheckNewlyActiveSets, 1500);
}

})();
