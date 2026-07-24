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
// #15 — Barra de progresso por secao (Base/Secretas) no fic-set-info
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
  const bctl=document.querySelector('.bctl');
  if(!bctl||bctl.style.display==='none') return;
  if(document.getElementById('fm-rarity-bulk')){ fmRefreshRarityOptions(); return; }
  const box=document.createElement('div');
  box.id='fm-rarity-bulk';
  box.style.cssText='display:flex;gap:6px;align-items:center';
  box.innerHTML=`
    <select id="fm-rarity-select" style="padding:6px 8px;background:var(--surface2);border:1px solid var(--border);
      border-radius:6px;color:var(--text);font-size:11px;max-width:170px"></select>
    <button id="fm-rarity-btn" type="button" style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);
      border-radius:6px;color:var(--text);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer"
      title="Marca como coletadas todas as cartas visíveis (respeitando busca/filtros atuais) dessa raridade">
      ✅ Marcar raridade</button>`;
  bctl.appendChild(box);
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
  if(typeof BINDER_PRESETS==='undefined'||typeof POKEDEX_NACIONAL==='undefined') return;
  if(BINDER_PRESETS.some(p=>p.key==='fm_pokedex_nacional')) return; // já instalado
  const genColors=['#e63946','#ffd166','#06d6a0','#118ab2','#a855f7','#ff6b35','#7C3AED','#3F51B5','#E91E63'];

  POKEDEX_GEN_RANGES.forEach((g,idx)=>{
    // pula geração 1 — já existe 'sv151_pokedex' dedicado e mais preciso
    if(g.gen===1) return;
    BINDER_PRESETS.push({
      key:'fm_gen_'+g.gen,
      name:'Pokédex '+g.label,
      emoji:'🧭',
      desc:`Geração ${g.gen} (${g.label}, #${g.from}-#${g.to}) — 1 carta por espécie que você tiver em qualquer coleção ativa`,
      color:genColors[idx%genColors.length],
      filter:function(c){
        const sp=speciesFromCardName(c.name);
        return !!sp && sp.dex>=g.from && sp.dex<=g.to;
      }
    });
  });

  // Preset "Pokédex Nacional" — cobertura honesta, não finge 100%.
  BINDER_PRESETS.push({
    key:'fm_pokedex_nacional',
    name:'Pokédex Nacional',
    emoji:'🌐',
    desc:'Todas as 1025 espécies conhecidas — mostra sua cobertura real com as coleções que você tem ativas (não é master set 100%, é o que existe nos sets cadastrados)',
    color:'#118ab2',
    filter:function(c){ return !!speciesFromCardName(c.name); }
  });
}

// ─────────────────────────────────────────────────────────────────
// WIRING — monkey-patch das funções globais, na ordem certa
// ─────────────────────────────────────────────────────────────────
function fmAfterRenderBinder(){
  try{ fmInjectSectionProgress(); }catch(e){}
  try{ fmInjectAlmostBadges(); }catch(e){}
  try{ fmInjectRarityBulk(); }catch(e){}
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
    try{ fmEnhanceBindersHome(); }catch(e){}
    try{ fmInjectSortControl(); }catch(e){}
  };
}

if(typeof window.openCustomBinderView==='function'){
  const _fmOrigOCBV=window.openCustomBinderView;
  window.openCustomBinderView=function(){
    _fmOrigOCBV.apply(this, arguments);
    try{ fmInjectBinderSetSummary(); }catch(e){}
  };
  // _cbRefreshGrid (busca dentro do fichário personalizado) é reatribuída a
  // cada abertura — reaplica o resumo depois de cada refresh de filtro também
  const _fmWrapRefreshGrid=function(){
    if(typeof window._cbRefreshGrid==='function' && !window._cbRefreshGrid.__fmWrapped){
      const _origRefresh=window._cbRefreshGrid;
      window._cbRefreshGrid=function(){ _origRefresh.apply(this,arguments); try{fmInjectBinderSetSummary();}catch(e){} };
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
