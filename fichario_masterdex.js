// fichario_masterdex.js — "Master Set Nacional" (24/07/2026)
// Pedido do Eduardo: "a lista dos 1025 é padronizada... quando eu quiser
// preencher este master set, eu quero a ordem correta do 1 ao 1025, e a
// possibilidade de excluir e acrescentar cartas nas vagas dos 1025".
//
// Reaproveita 100% o sistema de fichário personalizado que já existe
// (mesma tabela custom_binders, mesmo saveCustomBinder/getBinderCards/
// openCustomBinderView) com um filter_config.type NOVO: 'masterdex'.
// card_ids guarda {set,n,dex} — uma entrada por vaga PREENCHIDA; uma vaga
// sem escolha simplesmente não tem entrada (fica vazia no grid, com "+").
//
// Diferença importante em relação a 'manual'/'preset': aqueles dois usam
// getAllCardsWithSet() (só coleções que o usuário ativou em myCollections).
// O Master Set Nacional busca candidato em TODO o catálogo (SET_CARDS_MAP
// inteiro, as 143 coleções), porque o objetivo é fechar as 1025 espécies,
// não só o que já está ativo nas abas.
//
// Requer (carregado antes, na ordem do index.html): app.js, fichario_patch.js,
// pokedex_nacional.js (POKEDEX_NACIONAL), fichario_melhorias_23jul.js (fmDexOf).
(function(){

// ── Catálogo agrupado por dex, computado 1x (cache em window pra sobreviver
// a re-renders sem re-escanear ~19 mil cartas toda hora) ────────────────────
function fmMdexCatalogByDex(){
  if(window._fmMdexCache) return window._fmMdexCache;
  const byDex={};
  if(typeof SET_CARDS_MAP!=='undefined'){
    Object.keys(SET_CARDS_MAP).forEach(setId=>{
      let cards=[];
      try{ cards=SET_CARDS_MAP[setId]()||[]; }catch(e){ return; }
      cards.forEach(c=>{
        const dex=(typeof fmDexOf==='function')?fmDexOf(c):null;
        if(dex==null) return;
        if(!byDex[dex]) byDex[dex]=[];
        byDex[dex].push({setId,card:c});
      });
    });
  }
  window._fmMdexCache=byDex;
  return byDex;
}

function fmMdexIsOwned(setId,card){
  try{ return getSlots(card,setId).some(s=>collected.has(`${setId}:${card.n}:${s.ver}`)); }catch(e){ return false; }
}
function fmMdexPrice(card){ return (typeof card.price==='number' && card.price>0) ? card.price : Infinity; }

function fmMdexPickDefault(candidates){
  if(!candidates.length) return null;
  const owned=candidates.filter(x=>fmMdexIsOwned(x.setId,x.card));
  // CORRIGIDO 24/07/2026 (pedido do Eduardo): entre as cartas que ele JÁ TEM,
  // o Master Set deve mostrar a mais valiosa (é uma vitrine da melhor cópia
  // que ele possui de cada espécie) — não a mais barata. Só cai pra "mais
  // barata disponível" quando ele não tem NENHUMA carta daquela espécie ainda
  // (aí faz sentido sugerir a opção mais econômica pra fechar a vaga).
  if(owned.length){
    return owned.reduce((best,cur)=> fmMdexPrice(cur.card)>fmMdexPrice(best.card)?cur:best, owned[0]);
  }
  return candidates.reduce((best,cur)=> fmMdexPrice(cur.card)<fmMdexPrice(best.card)?cur:best, candidates[0]);
}

// CORRIGIDO 29/07/2026 (pedido do Eduardo: "a mesma função de trocar carta
// do Nacional" pros fichários regionais/temáticos, ex: Kanto, Sinnoh): agora
// aceita uma lista de espécies explícita, em vez de sempre a Pokédex inteira
// — assim o mesmo motor de "1 vaga por espécie + picker de troca" serve tanto
// pro Master Set Nacional (1-1025) quanto pra um Master Set regional (ex:
// Sinnoh, #387-#493).
function fmMdexBuildDefaultCardIds(species){
  const byDex=fmMdexCatalogByDex();
  const ids=[];
  (species||[]).forEach(sp=>{
    const pick=fmMdexPickDefault(byDex[sp.dex]||[]);
    if(pick) ids.push({set:pick.setId, n:String(pick.card.n), dex:sp.dex});
  });
  return ids;
}

// Faixa de dex de um binder masterdex — sem dexFrom/dexTo (binder criado
// antes desta mudança, ou o Nacional) = faixa completa 1-1025, mantendo o
// comportamento de sempre pro Master Set Nacional já existente.
function fmMdexRangeOf(binder){
  const cfg=(binder&&binder.filter_config)||{};
  const total=(typeof POKEDEX_NACIONAL!=='undefined')?POKEDEX_NACIONAL.length:1025;
  return {from:cfg.dexFrom||1, to:cfg.dexTo||total};
}
function fmMdexSpeciesFor(binder){
  const all=(typeof POKEDEX_NACIONAL!=='undefined')?POKEDEX_NACIONAL:[];
  const r=fmMdexRangeOf(binder);
  return all.filter(sp=>sp.dex>=r.from&&sp.dex<=r.to);
}

// CORRIGIDO 29/07/2026: agora pode existir MAIS DE UM binder masterdex ao
// mesmo tempo (Nacional + um por região) — precisa de um id explícito pra
// saber qual. Sem id (chamadas antigas), cai no comportamento de sempre:
// acha o primeiro binder do tipo 'masterdex' (o Nacional, na prática, já que
// costuma ser criado primeiro).
function fmMdexFindBinder(id){
  if(id) return (customBinders||[]).find(b=>String(b.id)===String(id));
  return (customBinders||[]).find(b=>b.filter_config&&b.filter_config.type==='masterdex');
}
function fmMdexAllBinders(){
  return (customBinders||[]).filter(b=>b.filter_config&&b.filter_config.type==='masterdex');
}

// NOVO 24/07/2026: preenche automaticamente só as vagas AINDA VAZIAS (nunca
// sobrescreve uma vaga que o usuário já escolheu manualmente). Existe porque
// o fichário já criado hoje ficou 0/1025 por causa do bug do fmDexOf (ver
// [[project_pokemon_tcg]]) — sem isso, o único jeito de recuperar seria
// excluir e criar de novo, perdendo eventuais trocas manuais já feitas.
// CORRIGIDO 29/07/2026: recebe o id do binder (pode ser o Nacional ou
// qualquer regional) em vez de assumir que só existe um.
async function fmMdexAutoFillEmpty(binderId){
  const binder=fmMdexFindBinder(binderId);
  if(!binder) return;
  const byDex=fmMdexCatalogByDex();
  const filled=new Set((binder.card_ids||[]).map(r=>r.dex));
  const species=fmMdexSpeciesFor(binder);
  let added=0;
  species.forEach(sp=>{
    if(filled.has(sp.dex)) return;
    const pick=fmMdexPickDefault(byDex[sp.dex]||[]);
    if(pick){ binder.card_ids.push({set:pick.setId,n:String(pick.card.n),dex:sp.dex}); added++; }
  });
  if(!added){ alert('Nenhuma vaga vazia com carta disponível pra preencher.'); return; }
  await fmMdexPersist(binder);
  fmMdexRender(binder,true);
  alert(`${added} vaga(s) preenchida(s) automaticamente.`);
}
window.fmMdexAutoFillEmpty=fmMdexAutoFillEmpty;

async function fmMdexCreate(){
  const existing=fmMdexAllBinders().find(b=>!b.filter_config.dexFrom&&!b.filter_config.dexTo);
  if(existing){ openCustomBinderView(existing); return; }
  if(typeof POKEDEX_NACIONAL==='undefined'){ alert('Pokédex Nacional ainda não carregou — tenta de novo em 1s.'); return; }
  if(!confirm('Isso vai criar um fichário com 1025 vagas (1 por espécie), já preenchendo com a carta MAIS VALIOSA que você já tiver de cada espécie (ou a mais barata disponível, se não tiver nenhuma). Depois dá pra trocar/esvaziar cada vaga. Continuar?')) return;
  const card_ids=fmMdexBuildDefaultCardIds(POKEDEX_NACIONAL);
  const payload={
    name:'🌐 Master Set Nacional (1025)', emoji:'🌐', layout:3,
    filter_config:{type:'masterdex'}, card_ids, cover_color:'#118ab2'
  };
  const saved=await saveCustomBinder(payload);
  if(saved) openCustomBinderView(saved);
  else alert('Erro ao criar — confira se está logado.');
}
window.fmMdexCreate=fmMdexCreate;

// NOVO 29/07/2026 (pedido do Eduardo: "a mesma função de trocar carta do
// Nacional" pra Kanto, Sinnoh e as outras regiões) — cria um Master Set do
// mesmo jeito, só que limitado à faixa de dex de UMA geração (usa
// POKEDEX_GEN_RANGES, já existente em pokedex_nacional.js).
const FM_MDEX_REGION_META={
  1:{emoji:'🔴',color:'#E53935'}, 2:{emoji:'🟡',color:'#FDD835'}, 3:{emoji:'🟢',color:'#43A047'},
  4:{emoji:'💎',color:'#5C6BC0'}, 5:{emoji:'⚫',color:'#424242'}, 6:{emoji:'🌸',color:'#EC407A'},
  7:{emoji:'🌺',color:'#FF7043'}, 8:{emoji:'⚔️',color:'#7E57C2'}, 9:{emoji:'🍇',color:'#8E24AA'},
};
async function fmMdexCreateRegional(gen){
  if(typeof POKEDEX_GEN_RANGES==='undefined'||typeof POKEDEX_NACIONAL==='undefined'){
    alert('Pokédex ainda não carregou — tenta de novo em 1s.'); return;
  }
  const g=POKEDEX_GEN_RANGES.find(x=>x.gen===gen);
  if(!g) return;
  const existing=fmMdexAllBinders().find(b=>b.filter_config.dexFrom===g.from&&b.filter_config.dexTo===g.to);
  if(existing){ openCustomBinderView(existing); return; }
  if(!confirm(`Isso vai criar um Master Set de ${g.label} (#${g.from}-#${g.to}, ${g.to-g.from+1} vagas), já preenchendo com a carta mais valiosa que você já tiver de cada espécie (ou a mais barata disponível). Depois dá pra trocar/esvaziar cada vaga. Continuar?`)) return;
  const species=POKEDEX_NACIONAL.filter(sp=>sp.dex>=g.from&&sp.dex<=g.to);
  const card_ids=fmMdexBuildDefaultCardIds(species);
  const meta=FM_MDEX_REGION_META[gen]||{emoji:'🗺️',color:'#118ab2'};
  const payload={
    name:`${meta.emoji} Master Set ${g.label} (#${g.from}-${g.to})`, emoji:meta.emoji, layout:3,
    filter_config:{type:'masterdex',dexFrom:g.from,dexTo:g.to}, card_ids, cover_color:meta.color
  };
  const saved=await saveCustomBinder(payload);
  if(saved) openCustomBinderView(saved);
  else alert('Erro ao criar — confira se está logado.');
}
window.fmMdexCreateRegional=fmMdexCreateRegional;

// ── getBinderCards: resolve 'masterdex' a partir do catálogo INTEIRO ────────
if(typeof window.getBinderCards==='function'){
  const _fmOrigGetBinderCards=window.getBinderCards;
  window.getBinderCards=function(binder){
    const cfg=(binder&&binder.filter_config)||{};
    if(cfg.type==='masterdex'){
      const ids=binder.card_ids||[];
      const out=[];
      ids.forEach(ref=>{
        const cards=(typeof SET_CARDS_MAP!=='undefined'&&SET_CARDS_MAP[ref.set])?(SET_CARDS_MAP[ref.set]()||[]):[];
        const card=cards.find(c=>String(c.n)===String(ref.n));
        if(card) out.push({...card,_setId:ref.set,_dex:ref.dex});
      });
      out.sort((a,b)=>(a._dex||0)-(b._dex||0));
      return out;
    }
    return _fmOrigGetBinderCards.apply(this,arguments);
  };
}

// NOVO 24/07/2026 (pedido do Eduardo): filtra a lista de espécies exibida
// a partir dos mesmos 3 inputs que o fichário personalizado normal usa
// (#cb-view-q/#cb-view-oc/#cb-view-om) — reaproveita exportCustomBinderText()
// sem mudar nada nela, já que ela já lê esses mesmos ids com `?.` (não quebra
// se não existirem, então também funciona pra "copiar lista" sem filtro).
function fmMdexFilteredSpecies(binder,species,bySpecies){
  const q=(document.getElementById('cb-view-q')?.value||'').toLowerCase().trim();
  const oc=document.getElementById('cb-view-oc')?.checked||false;
  const om=document.getElementById('cb-view-om')?.checked||false;
  return species.filter(sp=>{
    const c=bySpecies[sp.dex];
    const owned=c?fmMdexIsOwned(c._setId,c):false;
    if(oc && !owned) return false;
    if(om && owned) return false;
    if(q){
      const hay=(sp.name+' '+sp.dex+' '+(c?c.name+' '+c._setId:'')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}
// NOVO 30/07/2026 (pedido do Eduardo: "opção de visualização de grade e
// fichário" também no Master Set) — extraído da lógica que antes vivia direto
// em fmMdexRender/fmMdexRefreshGrid, pra não duplicar. Master Set não tem o
// conceito de "versão"/getSlots como os fichários normais (é uma vaga por
// espécie), então o modo Fichário aqui é uma paginação NxN das mesmas vagas
// (fmMdexSlotHtml), não o renderBinderView() usado nos outros fichários.
function fmMdexBuildGridHtml(species,bySpecies,color,binderId){
  if(!species.length){
    return `<div style="padding:30px;text-align:center;color:var(--muted);font-size:11px">Nenhuma espécie encontrada com esses filtros.</div>`;
  }
  const slotHtml=(sp)=>window._fmMdexSlotHtml(sp,bySpecies,color,binderId);
  if((window._fmMdexViewMode||'grid')==='binder'){
    const n=window._fmMdexPageSize||3;
    const perPage=n*n;
    const pages=[];
    for(let i=0;i<species.length;i+=perPage) pages.push(species.slice(i,i+perPage));
    return pages.map((pg,idx)=>`
      <div style="margin-bottom:18px">
        <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:4px">Página ${idx+1}/${pages.length}</div>
        <div style="display:grid;grid-template-columns:repeat(${n},1fr);gap:8px;border:1px solid var(--border);
                    border-radius:10px;padding:10px;background:var(--surface2)">
          ${pg.map(slotHtml).join('')}
        </div>
      </div>`).join('');
  }
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px">
    ${species.map(slotHtml).join('')}
  </div>`;
}
window.fmMdexBuildGridHtml=fmMdexBuildGridHtml;

// Alterna Grade/Fichário físico; re-renderiza a tela inteira (igual troca de
// layout nos outros fichários) pra reconstruir a toolbar (some/aparece o
// seletor de tamanho de página).
function fmMdexSetView(mode,binderId){
  window._fmMdexViewMode=mode;
  const binder=fmMdexFindBinder(binderId);
  if(binder) fmMdexRender(binder,true);
}
window.fmMdexSetView=fmMdexSetView;

function fmMdexSetPageSize(n,binderId){
  window._fmMdexPageSize=n;
  const binder=fmMdexFindBinder(binderId);
  if(binder) fmMdexRender(binder,true);
}
window.fmMdexSetPageSize=fmMdexSetPageSize;

// Só troca o conteúdo de #fm-mdex-grid (não o wrap.innerHTML inteiro) — assim
// o campo de busca não perde o foco a cada letra digitada, igual o padrão
// _cbRefreshGrid() já usado no fichário personalizado normal.
function fmMdexRefreshGrid(){
  // CORRIGIDO 29/07/2026: usa o binder ATUALMENTE aberto (window._cbCurrentBinder,
  // já rastreado por fmMdexRender), não mais "o primeiro masterdex que achar" —
  // necessário agora que pode haver Nacional + vários regionais ao mesmo tempo.
  const binder=fmMdexFindBinder(window._cbCurrentBinder&&window._cbCurrentBinder.id);
  const grid=document.getElementById('fm-mdex-grid');
  if(!binder||!grid||typeof window._fmMdexSlotHtml!=='function') return;
  const cards=getBinderCards(binder);
  const bySpecies={};
  cards.forEach(c=>{ bySpecies[c._dex]=c; });
  const allSpecies=fmMdexSpeciesFor(binder);
  const species=fmMdexFilteredSpecies(binder,allSpecies,bySpecies);
  const color=binder.cover_color||'#118ab2';
  grid.innerHTML=fmMdexBuildGridHtml(species,bySpecies,color,binder.id);
}
window.fmMdexRefreshGrid=fmMdexRefreshGrid;

// Markup de UMA vaga (preenchida ou vazia) — função pura, sem closure, pra
// poder ser chamada tanto do render completo (fmMdexRender) quanto do
// refresh parcial (fmMdexRefreshGrid, que só troca #fm-mdex-grid).
function fmMdexSlotHtml(sp,bySpecies,color,binderId){
  const c=bySpecies[sp.dex];
  if(!c){
    return `<div onclick="fmMdexOpenPicker(${sp.dex},'${binderId}')" title="#${sp.dex} ${sp.name} — vaga vazia, clique pra escolher uma carta"
      style="aspect-ratio:2/3;border-radius:8px;border:2px dashed var(--border);cursor:pointer;
             display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
             background:var(--surface2);padding:4px;text-align:center;transition:all .15s"
      onmouseover="this.style.borderColor='${color}'" onmouseout="this.style.borderColor='var(--border)'">
      <span style="font-size:16px;color:var(--muted)">+</span>
      <span style="font-size:7px;color:var(--muted);font-family:'Space Mono',monospace">#${sp.dex}</span>
      <span style="font-size:7px;color:var(--muted);line-height:1.2">${sp.name}</span>
    </div>`;
  }
  const owned=fmMdexIsOwned(c._setId,c);
  const imgSrc=(typeof getBinderImg==='function')?getBinderImg(c,c._setId):'';
  return `<div onclick="fmMdexOpenPicker(${sp.dex},'${binderId}')" title="#${sp.dex} ${sp.name} (${c._setId.toUpperCase()} #${c.n}) — clique pra trocar"
    style="aspect-ratio:2/3;border-radius:8px;overflow:hidden;cursor:pointer;position:relative;
           border:1px solid ${owned?color:'var(--border)'};box-shadow:${owned?`0 0 10px ${color}55`:'none'};transition:all .15s"
    onmouseover="this.style.transform='translateY(-2px) scale(1.03)'" onmouseout="this.style.transform=''">
    <img src="${imgSrc}" alt="${c.name}" loading="lazy" style="width:100%;height:100%;object-fit:cover;
      filter:${owned?'none':'grayscale(75%) brightness(.55)'}">
    ${owned?`<div style="position:absolute;top:3px;right:3px;width:15px;height:15px;background:${color};border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:700">✓</div>`:''}
    <div style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.6);color:#fff;font-size:7px;
      padding:1px 4px;border-radius:4px;font-family:'Space Mono',monospace">#${sp.dex}</div>
    <div style="position:absolute;bottom:0;left:0;right:0;padding:3px 4px;background:linear-gradient(transparent,rgba(0,0,0,.85));
      font-size:6px;color:rgba(255,255,255,.7);font-family:'Space Mono',monospace">${c._setId.toUpperCase()} #${c.n}</div>
  </div>`;
}
window._fmMdexSlotHtml=fmMdexSlotHtml;

// ── Render especial: grid de 1025 vagas fixas (preenchidas ou vazias) ───────
function fmMdexRender(binder,keepFilters){
  const wrap=document.getElementById('bwrap');
  if(!wrap) return;
  ['fic-binder-controls','fic-set-info','binder-stats'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  const bctl=document.querySelector('.bctl'); if(bctl) bctl.style.display='none';

  const cards=getBinderCards(binder); // {..., _setId, _dex}
  const bySpecies={};
  cards.forEach(c=>{ bySpecies[c._dex]=c; });
  let colCount=0;
  cards.forEach(c=>{ if(fmMdexIsOwned(c._setId,c)) colCount++; });
  // CORRIGIDO 29/07/2026: faixa de espécies do PRÓPRIO binder (Nacional = 1-1025,
  // regional = só a geração dele) em vez de sempre a Pokédex inteira.
  const allSpecies=fmMdexSpeciesFor(binder);
  const totalSlots=allSpecies.length||1025;
  const pct=totalSlots?Math.round(colCount/totalSlots*100):0;
  const color=binder.cover_color||'#118ab2';
  const pinned=(typeof isBinderPinned==='function')&&isBinderPinned(binder.id);
  window._cbCurrentBinder={...binder};

  // pra chamar de novo depois de re-render sem perder o que a pessoa digitou
  const prevQ=keepFilters?(document.getElementById('cb-view-q')?.value||''):'';
  const prevOC=keepFilters?(document.getElementById('cb-view-oc')?.checked||false):false;
  const prevOM=keepFilters?(document.getElementById('cb-view-om')?.checked||false):false;

  const species=fmMdexFilteredSpecies(binder,allSpecies,bySpecies);
  const gridHtml=fmMdexBuildGridHtml(species,bySpecies,color,binder.id);
  const fmViewMode=window._fmMdexViewMode||'grid';
  const fmPageSize=window._fmMdexPageSize||3;
  const fmViewToggleBtns=`
    <button onclick="fmMdexSetView('grid','${binder.id}')"
      style="padding:6px 10px;border-radius:6px;border:1px solid ${fmViewMode==='grid'?color:'var(--border)'};
             background:${fmViewMode==='grid'?color:'var(--surface2)'};
             color:${fmViewMode==='grid'?'#fff':'var(--muted)'};font-family:'Space Mono',monospace;font-size:10px;
             cursor:pointer;font-weight:${fmViewMode==='grid'?700:400};white-space:nowrap">🔲 Grade</button>
    <button onclick="fmMdexSetView('binder','${binder.id}')"
      style="padding:6px 10px;border-radius:6px;border:1px solid ${fmViewMode==='binder'?color:'var(--border)'};
             background:${fmViewMode==='binder'?color:'var(--surface2)'};
             color:${fmViewMode==='binder'?'#fff':'var(--muted)'};font-family:'Space Mono',monospace;font-size:10px;
             cursor:pointer;font-weight:${fmViewMode==='binder'?700:400};white-space:nowrap">📖 Fichário físico</button>`;
  const fmPageSizeBtns=fmViewMode==='binder'?[2,3,4].map(n=>`<button onclick="fmMdexSetPageSize(${n},'${binder.id}')"
    style="padding:5px 10px;border-radius:6px;border:1px solid ${n===fmPageSize?'var(--gold)':'var(--border)'};
           background:var(--surface2);color:${n===fmPageSize?'var(--gold)':'var(--muted)'};
           font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;
           font-weight:${n===fmPageSize?700:400}">${n}×${n} por página</button>`).join(''):'';

  wrap.innerHTML=`
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      <button onclick="renderCustomBindersHome()" style="padding:6px 12px;background:var(--surface2);
        border:1px solid var(--border);border-radius:6px;color:var(--muted);font-family:'Space Mono',monospace;
        font-size:10px;cursor:pointer">← Voltar</button>
      <div style="font-size:26px">${binder.emoji||'🌐'}</div>
      <div style="flex:1;min-width:100px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:var(--text)">${binder.name}</div>
        <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${cards.length}/${totalSlots} vagas preenchidas · ${colCount} coletadas</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;min-width:120px">
        <div style="flex:1;height:4px;background:var(--surface3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .4s"></div>
        </div>
        <span style="font-size:10px;color:${color};font-family:'Space Mono',monospace;font-weight:700">${pct}%</span>
      </div>
    </div>
    <div class="bctl" style="gap:8px;flex-wrap:wrap;margin-bottom:10px;display:flex;align-items:center">
      <input class="bsrch" id="cb-view-q" placeholder="Buscar espécie/carta..." oninput="fmMdexRefreshGrid()"
        style="flex:1;min-width:140px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);
               background:var(--surface2);color:var(--text);font-size:11px">
      <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--muted);cursor:pointer;white-space:nowrap">
        <input type="checkbox" id="cb-view-oc" onchange="fmMdexRefreshGrid()">Só coletadas</label>
      <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--muted);cursor:pointer;white-space:nowrap">
        <input type="checkbox" id="cb-view-om" onchange="fmMdexRefreshGrid()">Só faltantes</label>
      <button onclick="toggleBinderPinned('${binder.id}')" title="${pinned?'Remover da aba principal':'Fixar na aba principal (aparece junto com ME04, SV1 etc.)'}"
        style="padding:6px 10px;background:${pinned?color:'var(--surface2)'};border:1px solid ${pinned?color:'var(--border)'};
               border-radius:6px;color:${pinned?'#fff':'var(--muted)'};font-family:'Space Mono',monospace;
               font-size:10px;cursor:pointer;white-space:nowrap">📌 ${pinned?'Fixado':'Fixar aba'}</button>
      <button onclick='exportCustomBinderText(${safeJSON(binder)})' title="Copia a lista de texto (coletadas + faltantes) pra colar no WhatsApp"
        style="padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
               color:var(--text);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;white-space:nowrap">📋 Copiar lista</button>
      <button onclick='shareCustomBinderPrompt(${safeJSON(binder)})' title="Gera um link (e QR code) pra compartilhar este Master Set"
        style="padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
               color:var(--text);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;white-space:nowrap">🔗 Compartilhar</button>
      <button onclick="fmMdexPrint('${binder.id}')" title="Gera um PDF pra imprimir (páginas NxN, igual o fichário oficial)"
        style="padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
               color:var(--text);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;white-space:nowrap">🖨️ Imprimir</button>
      <button onclick="fmMdexAutoFillEmpty('${binder.id}')" title="Preenche as vagas ainda vazias com a carta mais valiosa que você já tem de cada espécie (ou a mais barata disponível, se não tiver nenhuma) — nunca mexe numa vaga que você já escolheu na mão"
        style="padding:6px 10px;background:${color};border:none;border-radius:6px;color:#fff;
               font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;white-space:nowrap">🔄 Preencher vagas vazias</button>
    </div>
    <div style="font-size:9px;color:var(--muted);margin-bottom:10px;line-height:1.5">
      Uma vaga por espécie, na faixa #${allSpecies[0]?.dex??1}–#${allSpecies[allSpecies.length-1]?.dex??totalSlots} da Pokédex. Clique em qualquer vaga —
      preenchida ou vazia — pra escolher qual carta ocupa ela, entre todas as coleções cadastradas no site.
      Vagas preenchidas automaticamente mostram a carta mais valiosa que você já tem daquela espécie.
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">${fmViewToggleBtns}</div>
    ${fmPageSizeBtns?`<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">${fmPageSizeBtns}</div>`:''}
    <div id="fm-mdex-grid">${gridHtml}</div>`;

  const qEl=document.getElementById('cb-view-q'); if(qEl) qEl.value=prevQ;
  const ocEl=document.getElementById('cb-view-oc'); if(ocEl) ocEl.checked=prevOC;
  const omEl=document.getElementById('cb-view-om'); if(omEl) omEl.checked=prevOM;
}

// ── Picker por vaga (trocar carta / esvaziar) ───────────────────────────────
function fmMdexEnsurePickerModal(){
  if(document.getElementById('mmdexpick')) return;
  const ov=document.createElement('div');
  ov.className='ov'; ov.id='mmdexpick';
  ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('mmdexpick'); });
  ov.innerHTML=`<div class="modal modal-wide" style="max-height:85vh;overflow-y:auto">
    <button class="mc-btn" onclick="closeModal('mmdexpick')">✕</button>
    <div id="mmdexpick-content"></div>
  </div>`;
  document.body.appendChild(ov);
}
// CORRIGIDO 29/07/2026: agora recebe binderId — a mesma vaga (mesmo #dex)
// pode existir em MAIS de um binder ao mesmo tempo (Nacional + regional que
// cobre aquela espécie), então precisa saber em qual está mexendo.
function fmMdexOpenPicker(dex,binderId){
  fmMdexEnsurePickerModal();
  const byDex=fmMdexCatalogByDex();
  const cands=(byDex[dex]||[]).slice().sort((a,b)=>fmMdexPrice(a.card)-fmMdexPrice(b.card));
  const sp=(typeof POKEDEX_NACIONAL!=='undefined'?POKEDEX_NACIONAL:[]).find(s=>s.dex===dex);
  const binder=fmMdexFindBinder(binderId);
  const current=binder?(binder.card_ids||[]).find(r=>r.dex===dex):null;
  const rows=cands.map(x=>{
    const owned=fmMdexIsOwned(x.setId,x.card);
    const isCurrent=current&&current.set===x.setId&&String(current.n)===String(x.card.n);
    const price=x.card.price?('R$'+x.card.price.toFixed(2).replace('.',',')):'—';
    return `<div onclick="fmMdexChooseCard(${dex},'${x.setId}','${x.card.n}','${binderId}')"
      style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;cursor:pointer;
             background:${isCurrent?'var(--surface3)':'transparent'};border:1px solid ${isCurrent?'var(--accent)':'transparent'}">
      <img src="${(typeof getBinderImg==='function')?getBinderImg(x.card,x.setId):''}" style="width:36px;height:50px;object-fit:cover;border-radius:4px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:700;color:var(--text)">${x.card.name} <span style="color:var(--muted);font-weight:400">#${x.card.n}</span></div>
        <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${x.setId.toUpperCase()} · ${x.card.rare||''} · ${price}${owned?' · ✅ você tem':''}</div>
      </div>
      ${isCurrent?'<span style="font-size:10px;color:var(--accent);font-weight:700">atual</span>':''}
    </div>`;
  }).join('');
  const content=document.getElementById('mmdexpick-content');
  if(!content) return;
  content.innerHTML=`
    <h3 style="margin:0 0 4px">#${dex} ${sp?sp.name:''}</h3>
    <p style="font-size:11px;color:var(--muted);margin:0 0 12px">
      ${cands.length} carta(s) encontrada(s) pra essa espécie em todas as coleções cadastradas. Clique pra escolher qual ocupa a vaga.
    </p>
    <div style="max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${rows||'<div style="padding:16px;text-align:center;color:var(--muted);font-size:11px">Nenhuma carta cadastrada pra essa espécie ainda em nenhuma coleção do site.</div>'}
    </div>
    ${current?`<button onclick="fmMdexRemoveSlot(${dex},'${binderId}')" style="margin-top:12px;width:100%;padding:8px;
      background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--accent);
      font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">🗑️ deixar esta vaga vazia</button>`:''}`;
  openModal('mmdexpick');
}
window.fmMdexOpenPicker=fmMdexOpenPicker;

async function fmMdexPersist(binder){
  await saveCustomBinder(binder);
  const idx=(customBinders||[]).findIndex(b=>b.id===binder.id);
  if(idx>=0) customBinders[idx]=binder;
}
async function fmMdexChooseCard(dex,setId,n,binderId){
  const binder=fmMdexFindBinder(binderId);
  if(!binder) return;
  binder.card_ids=(binder.card_ids||[]).filter(r=>r.dex!==dex);
  binder.card_ids.push({set:setId,n:String(n),dex});
  await fmMdexPersist(binder);
  closeModal('mmdexpick');
  fmMdexRender(binder,true);
}
window.fmMdexChooseCard=fmMdexChooseCard;
async function fmMdexRemoveSlot(dex,binderId){
  const binder=fmMdexFindBinder(binderId);
  if(!binder) return;
  binder.card_ids=(binder.card_ids||[]).filter(r=>r.dex!==dex);
  await fmMdexPersist(binder);
  closeModal('mmdexpick');
  fmMdexRender(binder,true);
}
window.fmMdexRemoveSlot=fmMdexRemoveSlot;

// NOVO 29/07/2026 (pedido do Eduardo: "imprimir o pdf" pros fichários
// personalizados também) — reaproveita o mesmo printBinder() do fichário
// oficial (fichario_patch.js), que agora aceita cartas+setId explícitos
// em vez de só currentSet/getSetCards().
function fmMdexPrint(binderId){
  const binder=fmMdexFindBinder(binderId);
  if(!binder||typeof printBinder!=='function') return;
  const cards=getBinderCards(binder); // já vem com _setId por carta
  printBinder(cards, c=>c._setId, binder.name);
}
window.fmMdexPrint=fmMdexPrint;

// ── openCustomBinderView: desvia pro render especial se for masterdex ───────
if(typeof window.openCustomBinderView==='function'){
  const _fmOrigOpenCBVmdex=window.openCustomBinderView;
  window.openCustomBinderView=function(binder){
    if(typeof binder==='string') binder=JSON.parse(binder);
    if(binder&&binder.filter_config&&binder.filter_config.type==='masterdex'){
      _currentCustomBinderId=binder.id||'__masterdex__';
      fmMdexRender(binder);
      return;
    }
    return _fmOrigOpenCBVmdex.apply(this,arguments);
  };
}

// ── Entrada dedicada na Home de "Meus Fichários" (fora da grade genérica,
// pra não expor Editar/Excluir padrão — que não entendem filter_config
// type:'masterdex' — em cima dele) ──────────────────────────────────────────
// CORRIGIDO 29/07/2026 (pedido do Eduardo: "a mesma função... pra Kanto,
// Sinnoh e etc") — antes só existia UM Master Set possível (o Nacional).
// Agora lista TODOS os já criados (Nacional + qualquer regional) como
// cards, e oferece criar um novo regional por geração (Kanto, Johto, Hoenn,
// Sinnoh, Unova, Kalos, Alola, Galar/Hisui, Paldea) além do Nacional.
function fmMdexHomeCardHtml(binder){
  const cards=getBinderCards(binder);
  let col=0; cards.forEach(c=>{ if(fmMdexIsOwned(c._setId,c)) col++; });
  const total=fmMdexSpeciesFor(binder).length;
  const pct=total?Math.round(col/total*100):0;
  const cor=binder.cover_color||'#118ab2';
  return `<div style="padding:16px;border-radius:10px;border:1px solid var(--border);
         background:var(--surface2);border-left:3px solid ${cor};display:flex;align-items:center;gap:14px">
    <div onclick='openCustomBinderView(${safeJSON(binder)})' style="font-size:30px;cursor:pointer">${binder.emoji||'🌐'}</div>
    <div onclick='openCustomBinderView(${safeJSON(binder)})' style="flex:1;cursor:pointer">
      <div style="font-size:13px;font-weight:700;color:var(--text)">${binder.name}</div>
      <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${pct}% das ${total} espécies coletadas · ${cards.length}/${total} vagas preenchidas — clique pra continuar</div>
    </div>
    <button onclick="deleteCustomBinder('${binder.id}')" title="Excluir Master Set"
      style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:4px;opacity:.6"
      onmouseover="this.style.opacity='1';this.style.color='var(--accent)'"
      onmouseout="this.style.opacity='.6';this.style.color='var(--muted)'">✕</button>
  </div>`;
}
function fmMdexInjectHomeEntry(){
  const wrap=document.getElementById('bwrap');
  if(!wrap||!wrap.firstElementChild) return;
  const existingAll=fmMdexAllBinders();
  const hasNacional=existingAll.some(b=>!b.filter_config.dexFrom&&!b.filter_config.dexTo);
  const box=document.createElement('div');
  box.id='fm-mdex-entry';
  box.style.cssText='margin:18px 0 28px';

  const cardsHtml=existingAll.map(fmMdexHomeCardHtml).join('');
  const createNacionalHtml=hasNacional?'':`<div onclick="fmMdexCreate()"
      style="padding:16px;border-radius:10px;cursor:pointer;border:1px dashed #118ab2;
             background:var(--surface2);display:flex;align-items:center;gap:14px;margin-bottom:10px">
      <div style="font-size:30px">🌐</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:var(--text)">Criar Master Set Nacional (1–1025)</div>
        <div style="font-size:9px;color:var(--muted);line-height:1.5">Uma vaga por espécie, na ordem oficial da Pokédex — preenche automaticamente com a carta MAIS VALIOSA que você já tem de cada espécie (ou a mais barata disponível, se não tiver nenhuma), e você pode trocar ou esvaziar qualquer vaga depois.</div>
      </div>
    </div>`;

  const regionsHtml=(typeof POKEDEX_GEN_RANGES!=='undefined'?POKEDEX_GEN_RANGES:[])
    .filter(g=>!existingAll.some(b=>b.filter_config.dexFrom===g.from&&b.filter_config.dexTo===g.to))
    .map(g=>{
      const meta=FM_MDEX_REGION_META[g.gen]||{emoji:'🗺️',color:'#118ab2'};
      return `<button onclick="fmMdexCreateRegional(${g.gen})"
        style="padding:8px 12px;border-radius:8px;border:1px dashed ${meta.color};background:var(--surface2);
               color:var(--text);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;
               display:flex;align-items:center;gap:6px;white-space:nowrap">${meta.emoji} ${g.label} <span style="color:var(--muted)">#${g.from}-${g.to}</span></button>`;
    }).join('');

  box.innerHTML=`
    ${createNacionalHtml}
    ${cardsHtml}
    ${regionsHtml?`<div style="margin-top:10px">
      <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;letter-spacing:1px;margin-bottom:6px">
        + CRIAR MASTER SET REGIONAL (1 vaga por espécie, só daquela geração)</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${regionsHtml}</div>
    </div>`:''}`;
  wrap.firstElementChild.insertAdjacentElement('afterend', box);
}
if(typeof window.renderCustomBindersHome==='function'){
  const _fmOrigRCBHmdex=window.renderCustomBindersHome;
  window.renderCustomBindersHome=function(){
    // CORRIGIDO 29/07/2026: agora pode haver VÁRIOS binders masterdex
    // (Nacional + um por região) — esconde todos da grade genérica durante
    // o render original (que não entende filter_config tipo 'masterdex') e
    // recoloca todos depois, na mesma posição de antes.
    const removidos=[]; // [{idx,binder}]
    fmMdexAllBinders().forEach(b=>{
      const idx=customBinders.indexOf(b);
      if(idx>=0) removidos.push({idx,binder:customBinders.splice(idx,1)[0]});
    });
    _fmOrigRCBHmdex.apply(this,arguments);
    // reinsere na ordem original (índices crescentes)
    removidos.sort((a,b)=>a.idx-b.idx).forEach(r=>customBinders.splice(r.idx,0,r.binder));
    try{ fmMdexInjectHomeEntry(); }catch(e){}
  };
}

})();
