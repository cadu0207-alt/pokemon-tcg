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
  // CORRIGIDO 01/11/2026 (pedido do Eduardo): NÃO puxa carta automática. O Master Set nasce com todas as vagas
  // mostrando a arte neutra do Pokémon; a carta só aparece quando a pessoa escolhe (clica na vaga).
  if(!confirm('Isso vai criar um fichário com 1025 vagas (1 por espécie). Cada vaga mostra a imagem padrão do Pokémon até você escolher a carta que quer nela. Continuar?')) return;
  const card_ids=[];
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
  // 01/11/2026: sem preenchimento automático (ver fmMdexCreate) — vagas começam na arte neutra do Pokémon.
  if(!confirm(`Isso vai criar um Master Set de ${g.label} (#${g.from}-#${g.to}, ${g.to-g.from+1} vagas). Cada vaga mostra a imagem padrão do Pokémon até você escolher a carta que quer nela. Continuar?`)) return;
  const card_ids=[];
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

// NOVO 02/09/2026 (pedido do Eduardo: "o master set nacional esta
// disponivel para todos? nao estou achando nem ele nem o regional") — dados
// compartilhados pra dar ao Pokédex (Nacional + regionais) um item de
// PRIMEIRO NÍVEL nos menus de navegação (mobile: fichario_accordion.js,
// desktop: fichario_nav_desktop.js), em vez de só existir escondido dentro
// de "Coleções Gerais" (ver análise 23/08/2026, seção 4.1). Cada item já
// existente vira um atalho direto pro binder (tabId '__cb__<id>'); cada um
// que falta vira um botão de criar (mesma fmMdexCreate/fmMdexCreateRegional
// de sempre) — assim os dois arquivos de menu só leem esta lista, sem
// duplicar a lógica de "quais regionais existem"/cores/emojis.
function fmMdexNavItems(){
  const existingAll=fmMdexAllBinders();
  const items=[];
  const nacional=existingAll.find(b=>!b.filter_config.dexFrom&&!b.filter_config.dexTo);
  if(nacional){
    items.push({tabId:'__cb__'+nacional.id,label:nacional.name,emoji:nacional.emoji||'🌐',
      color:nacional.cover_color||'#118ab2',create:false});
  }else{
    items.push({tabId:null,label:'Criar Master Set Nacional (1–1025)',emoji:'🌐',color:'#118ab2',
      create:true,onclickFn:'fmMdexCreate()'});
  }
  (typeof POKEDEX_GEN_RANGES!=='undefined'?POKEDEX_GEN_RANGES:[]).forEach(g=>{
    const existing=existingAll.find(b=>b.filter_config.dexFrom===g.from&&b.filter_config.dexTo===g.to);
    const meta=FM_MDEX_REGION_META[g.gen]||{emoji:'🗺️',color:'#118ab2'};
    if(existing){
      items.push({tabId:'__cb__'+existing.id,label:existing.name,emoji:existing.emoji||meta.emoji,
        color:existing.cover_color||meta.color,create:false});
    }else{
      items.push({tabId:null,label:`Criar Master Set ${g.label} (#${g.from}-${g.to})`,
        emoji:meta.emoji,color:meta.color,create:true,onclickFn:`fmMdexCreateRegional(${g.gen})`});
    }
  });
  return items;
}
window.fmMdexNavItems=fmMdexNavItems;

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
// CORRIGIDO 04/11/2026 (relato: "erro de busca nas Pokédex nacional e regional" + "busca por código da carta"):
// a busca antiga era um único includes() em "nome dex nome-da-carta set" — não achava "Flabébé" digitando "flabebe"
// (acento), não aceitava código ("sv7 45", "obf 125", "125/230") e disparava a 1025 vagas a cada tecla (travava
// no celular). Agora: sem acento, em palavras (todas precisam bater), com código de coleção + número, e a digitação
// tem um pequeno atraso (fmMdexSearchInput). Mesma regra de leitura do código que a busca da Consignação (mk_consign.js).
function fmNorm(t){ return String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
let _fmSetIx=null;
function fmSetIndex(){
  if(_fmSetIx) return _fmSetIx;
  const keys={}, meta={};
  (typeof SET_CATALOG!=='undefined'?SET_CATALOG:[]).forEach((s,order)=>{
    const m=/^([^—(]+?)\s*(?:\(([^)]+)\))?\s*—\s*(.+)$/.exec(s.label||'');
    const short=m?m[1].trim():String(s.id).toUpperCase(), code=m&&m[2]?m[2]:'', name=m?m[3].trim():(s.label||s.id);
    meta[s.id]={short,code,name,order};
    [s.id,short,code].forEach(k=>{ if(!k) return; const kk=fmNorm(k).replace(/\./g,'pt'); keys[kk]=keys[kk]||s.id; });
  });
  _fmSetIx={keys,meta};
  return _fmSetIx;
}
function fmSetText(setId){ const m=fmSetIndex().meta[setId]; return m?fmNorm(m.short+' '+m.code+' '+m.name):''; }
// Lê a busca: 1º número = nº da carta/Pokédex (o 2º de "125/230" é o total da coleção, ignora); palavra que é código
// de coleção (sv7, obf, sv3pt5...) vira filtro de coleção; o resto são palavras do nome.
function fmParseQuery(q){
  const toks=fmNorm(q).replace(/[#\/\\_,]+/g,' ').replace(/\s*-\s*/g,' ').split(/\s+/).filter(Boolean);
  const ix=fmSetIndex(); let setId=null,setTok=null,num=null; const words=[];
  toks.forEach(t=>{
    const k=t.replace(/\./g,'pt');
    if(/^\d{1,4}$/.test(t)){ if(num==null) num=parseInt(t,10); }
    else if(!setId && k.length>=3 && !/^(vmax|vstar|gx|tag|team|ex)$/.test(k) && ix.keys[k]){ setId=ix.keys[k]; setTok=t; }
    else words.push(t);
  });
  return {setId,setTok,num,words,empty:!toks.length};
}
// f = {hay (texto normalizado), set (id da coleção da carta ou null), num (nº da carta ou null), dex (nº da Pokédex ou null)}
function fmQueryMatch(pq,f){
  if(pq.empty) return true;
  if(pq.num!=null && !(f.num===pq.num || (f.dex!=null && f.dex===pq.num))) return false;
  // código de coleção é "mole": se a palavra também aparece no nome ("meg" em Meganium) ainda vale como nome
  if(pq.setId && f.set!==pq.setId && f.hay.indexOf(pq.setTok)<0) return false;
  for(let i=0;i<pq.words.length;i++) if(f.hay.indexOf(pq.words[i])<0) return false;
  return true;
}
function fmCardNum(c){ const n=parseInt(c&&c.n,10); return Number.isFinite(n)?n:null; }
let _fmQT=null;
function fmMdexSearchInput(){ clearTimeout(_fmQT); _fmQT=setTimeout(()=>fmMdexRefreshGrid(),220); }
window.fmMdexSearchInput=fmMdexSearchInput;
function fmMdexFilteredSpecies(binder,species,bySpecies){
  const q=(document.getElementById('cb-view-q')?.value||'').trim();
  const oc=document.getElementById('cb-view-oc')?.checked||false;
  const om=document.getElementById('cb-view-om')?.checked||false;
  const pq=q?fmParseQuery(q):null;
  return species.filter(sp=>{
    const c=bySpecies[sp.dex];
    const owned=c?fmMdexIsOwned(c._setId,c):false;
    if(oc && !owned) return false;
    if(om && owned) return false;
    if(pq){
      const hay=fmNorm(sp.name+' '+sp.dex+' '+(c?c.name+' '+c._setId+' '+(c.rare||'')+' '+fmSetText(c._setId):''));
      if(!fmQueryMatch(pq,{hay,set:c?c._setId:null,num:c?fmCardNum(c):null,dex:sp.dex})) return false;
    }
    return true;
  });
}

// CSS do Master Set (04/11/2026): efeito de "hover" nas vagas agora é CSS só em dispositivo com mouse. Antes era
// onmouseover/onmouseout inline que mexia em transform/borda — no iPhone/Safari o 1º toque num elemento cujo hover
// muda o visual é consumido como "hover" e o clique NÃO acontece (relato: "no celular ao clicar não abre").
function fmMdexEnsureStyles(){
  if(document.getElementById('fm-mdex-css')) return;
  const st=document.createElement('style'); st.id='fm-mdex-css';
  st.textContent=`
.fm-slot{cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .15s,border-color .15s}
.fm-slot:active{transform:scale(.97)}
@media (hover:hover){ .fm-slot:not(.fm-slot-empty):hover{transform:translateY(-2px) scale(1.03)} .fm-slot-empty:hover{border-color:var(--fmc,var(--accent))!important} }
.fm-q{font-size:11px}
#mmdexpick .modal{width:min(1100px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;padding:22px}
#mmdexpick-content{display:flex;flex-direction:column;min-height:0;flex:1}
.fm-pick-h{margin:0 0 2px;padding-right:38px}
.fm-pick-sub{font-size:11px;color:var(--muted);margin:0 0 10px;line-height:1.5}
.fm-pick-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.fm-pick-bar input[type=search]{flex:1 1 220px;min-width:0;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px}
.fm-pick-bar select{padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:12px}
.fm-pick-bar label{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);cursor:pointer;white-space:nowrap}
.fm-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:12px;overflow-y:auto;min-height:0;flex:1;padding:4px 2px 8px;-webkit-overflow-scrolling:touch}
.fm-pick-card{display:flex;flex-direction:column;gap:5px;padding:6px;border:2px solid transparent;border-radius:10px;background:var(--surface2);cursor:pointer;text-align:left;color:var(--text);font:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .12s,border-color .12s}
.fm-pick-card.cur{border-color:var(--accent);background:var(--surface3)}
@media (hover:hover){ .fm-pick-card:hover{border-color:var(--border2);transform:translateY(-2px)} .fm-pick-card.cur:hover{border-color:var(--accent)} }
.fm-pick-img{position:relative;aspect-ratio:2/3;border-radius:6px;overflow:hidden;background:var(--surface3)}
.fm-pick-img img{width:100%;height:100%;object-fit:cover;display:block}
.fm-pick-own{position:absolute;top:4px;right:4px;background:#06d6a0;color:#04201a;border-radius:10px;font-size:10px;font-weight:700;padding:1px 7px}
.fm-pick-cur{position:absolute;top:4px;left:4px;background:var(--accent);color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 7px}
.fm-pick-name{font-size:12px;font-weight:700;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.fm-pick-meta{font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;line-height:1.4}
.fm-pick-price{font-size:12px;font-weight:700;color:var(--teal)}
.fm-pick-empty{grid-column:1/-1;padding:24px;text-align:center;color:var(--muted);font-size:12px}
.fm-pick-rm{margin-top:10px;width:100%;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--accent);font-family:'Space Mono',monospace;font-size:11px;cursor:pointer;flex-shrink:0}
@media (max-width:640px){
  .fm-q,.fm-pick-bar input[type=search],.fm-pick-bar select{font-size:16px}
  #mmdexpick{padding:8px}
  #mmdexpick .modal{width:100%;max-width:100%;max-height:94vh;padding:16px 12px;border-radius:14px}
  .fm-pick-grid{grid-template-columns:repeat(3,1fr);gap:8px}
  .fm-pick-card{padding:4px;gap:4px}
  .fm-pick-name{font-size:11px}
  .fm-pick-meta{font-size:9px}
}`;
  document.head.appendChild(st);
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
  // Dashboard (04/09/2026, pedido do Eduardo: "no fichário nacional/regional
  // não tem dashboard igual o dos outros") — mesmo 3º modo do fichário oficial,
  // mas adaptado: aqui é 1 carta por ESPÉCIE (não por versão N/F/RH/SP), então
  // o valor soma por vaga preenchida, e vagas vazias (sem carta escolhida)
  // viram um contador à parte em vez de entrar na conta de "falta".
  if((window._fmMdexViewMode||'grid')==='dash') return fmMdexRenderDashboard(species,bySpecies);
  const slotHtml=(sp)=>window._fmMdexSlotHtml(sp,bySpecies,color,binderId);
  if((window._fmMdexViewMode||'grid')==='binder'){
    const n=window._fmMdexPageSize||3;
    const dims=(typeof binderDims==='function')?binderDims(n):{cols:n,rows:n};
    const perPage=dims.cols*dims.rows;
    const pages=[];
    for(let i=0;i<species.length;i+=perPage) pages.push(species.slice(i,i+perPage));
    return pages.map((pg,idx)=>`
      <div style="margin-bottom:18px">
        <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:4px">Página ${idx+1}/${pages.length}</div>
        <div style="display:grid;grid-template-columns:repeat(${dims.cols},1fr);gap:8px;border:1px solid var(--border);
                    border-radius:10px;padding:10px;background:var(--surface2)">
          ${pg.map(slotHtml).join('')}
        </div>
      </div>`).join('');
  }
  // CORRIGIDO 04/09/2026 (pedido do Eduardo: "o fichário nacional/regional
  // está com tamanho diferente dos outros fichários") — minmax(80px,...)
  // fixo ignorava a var(--cw) que TODO fichário oficial usa (112px desktop/
  // 72px mobile, com breakpoints próprios) — resultado: cartas menores que
  // as dos outros fichários no desktop, maiores no mobile. Trocado pela
  // mesma classe .bgrid que renderGridView() usa, em vez de reinventar.
  return `<div class="bgrid">
    ${species.map(slotHtml).join('')}
  </div>`;
}
window.fmMdexBuildGridHtml=fmMdexBuildGridHtml;

// ── Dashboard (04/09/2026) — mesmo conceito do fichário oficial
// (renderFicDashboard, fichario_patch.js), mas por ESPÉCIE em vez de por
// slot/versão: cada vaga preenchida tem 1 carta escolhida (fmMdexPickDefault
// já favorece a mais valiosa que você tem, ou a mais barata disponível se
// não tiver nenhuma). Vaga vazia não entra na soma de valor (não tem carta
// escolhida pra precificar) — vira só uma contagem à parte.
function fmMdexRenderDashboard(species,bySpecies){
  let ownedValue=0,missingValue=0,ownedCount=0,missingCount=0,emptyCount=0;
  let bestOwned=null,bestMissing=null;
  species.forEach(sp=>{
    const c=bySpecies[sp.dex];
    if(!c){ emptyCount++; return; }
    const priceRaw=fmMdexPrice(c);
    const price=isFinite(priceRaw)?priceRaw:0;
    if(fmMdexIsOwned(c._setId,c)){
      ownedValue+=price; ownedCount++;
      if(!bestOwned||price>bestOwned.price) bestOwned={card:c,price};
    }else{
      missingValue+=price; missingCount++;
      if(!bestMissing||price>bestMissing.price) bestMissing={card:c,price};
    }
  });
  const totalValue=ownedValue+missingValue;
  const pctValue=totalValue?Math.round(ownedValue/totalValue*100):0;

  const tiles=[
    kpiHTML('teal','💰 Valor da Coleção','R$'+fmtR(ownedValue),ownedCount+' espécie'+(ownedCount===1?'':'s')+' que você tem'),
    kpiHTML('red','🎯 Falta pra Fechar','R$'+fmtR(missingValue),missingCount+' espécie'+(missingCount===1?'':'s')+' com vaga escolhida, faltando'),
    kpiHTML('gold','📦 Valor Total (vagas preenchidas)','R$'+fmtR(totalValue),pctValue+'% do valor já é seu'),
  ];
  if(bestOwned)   tiles.push(kpiHTML('blue',  '⭐ Sua Carta Mais Valiosa','R$'+fmtR(bestOwned.price),  bestOwned.card.name  +' #'+bestOwned.card.n  +' ('+bestOwned.card._setId.toUpperCase()+')'));
  if(bestMissing) tiles.push(kpiHTML('orange','💸 Falta Mais Cara',       'R$'+fmtR(bestMissing.price),bestMissing.card.name+' #'+bestMissing.card.n+' ('+bestMissing.card._setId.toUpperCase()+')'));
  if(emptyCount)  tiles.push(kpiHTML('',      '⬜ Vagas Vazias',          String(emptyCount),           'sem carta escolhida ainda — não entram na conta de valor'));

  return `<div class="kpi-grid">${tiles.join('')}</div>
    <div style="font-size:9px;color:var(--muted);margin-top:10px">
      Valor calculado só sobre as vagas já preenchidas (a carta escolhida pra cada espécie) — vagas vazias não têm carta definida pra precificar.
    </div>`;
}
window.fmMdexRenderDashboard=fmMdexRenderDashboard;

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
// NOVO 01/11/2026 (pedido do Eduardo): vaga SEM carta escolhida mostra a arte neutra do Pokémon (em vez do "+" vazio) —
// quando ele quiser completar, é só clicar e escolher a carta. #1-151 saem de assets/wild (arquivos do próprio site,
// o mesmo conjunto do minigame); o resto vem do artwork oficial da PokeAPI via jsDelivr (cai no raw.githubusercontent
// e, por fim, no sprite pequeno, se algum provedor bloquear).
function fmMdexNeutralImg(dex){
  return dex<=151 ? `assets/wild/${dex}.webp` : `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${dex}.png`;
}
function fmMdexNeutralFallback(img,dex){
  const st=img.dataset.fb||'0';
  if(st==='0'){ img.dataset.fb='1'; img.src=`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`; }
  else if(st==='1'){ img.dataset.fb='2'; img.src=`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`; }
  else img.style.display='none';
}
window.fmMdexNeutralFallback=fmMdexNeutralFallback;
function fmMdexSlotHtml(sp,bySpecies,color,binderId){
  const c=bySpecies[sp.dex];
  if(!c){
    return `<div class="fm-slot fm-slot-empty" onclick="fmMdexOpenPicker(${sp.dex},'${binderId}')" title="#${sp.dex} ${sp.name} — sem carta escolhida (mostrando a arte neutra). Clique pra escolher uma carta"
      style="--fmc:${color};aspect-ratio:2/3;border-radius:8px;border:1px dashed var(--border);position:relative;overflow:hidden;
             background:var(--surface2)">
      <img src="${fmMdexNeutralImg(sp.dex)}" alt="${sp.name}" loading="lazy" decoding="async" referrerpolicy="no-referrer"
        ${sp.dex>151?`onerror="fmMdexNeutralFallback(this,${sp.dex})"`:''}
        style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:14% 8% 22%;opacity:.6;filter:grayscale(45%)">
      <div style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.6);color:#fff;font-size:7px;
        padding:1px 4px;border-radius:4px;font-family:'Space Mono',monospace">#${sp.dex}</div>
      <div style="position:absolute;bottom:0;left:0;right:0;padding:8px 4px 3px;background:linear-gradient(transparent,rgba(0,0,0,.75));
        font-size:7px;color:#fff;text-align:center;line-height:1.2">+ ${sp.name}</div>
    </div>`;
  }
  const owned=fmMdexIsOwned(c._setId,c);
  const imgSrc=(typeof getBinderImg==='function')?getBinderImg(c,c._setId):'';
  // CORRIGIDO 04/09/2026 (pedido do Eduardo): clique na vaga preenchida abria
  // direto o picker de TROCAR carta — não dava pra marcar se tem/não tem (nem
  // a versão N/F/RH/SP) sem sair da Pokédex e ir no fichário do set real.
  // Agora o clique principal abre o mesmo modal de sempre (openSlotModal, o
  // que já cuida de N/F/RH/SP + quantidade + origem e grava direto em
  // collected/Supabase — é o MESMO slot da coleção real, não uma cópia) via
  // fmMdexMarkOwned(); trocar qual carta representa a espécie virou uma ação
  // secundária (botão ⇄ no canto, só ele chama fmMdexOpenPicker).
  // Badge de raridade (04/09/2026, pedido do Eduardo: mesmo badge do
  // fichário oficial, também no Master Set) — rarityBadge/​_badgeInk vêm de
  // fichario_patch.js (carrega antes). Mostra a raridade real da carta
  // escolhida pra essa vaga (Illustration Rare, Ultra Rara, ACE SPEC...),
  // não só "SP" genérico; raridades base (Comum/Incomum/Rara) caem no
  // fallback cinza de rarityBadge(), mostrando o próprio nome.
  const rb  = (typeof rarityBadge === 'function') ? rarityBadge(c) : null;
  const rbInk = rb && typeof _badgeInk === 'function' ? _badgeInk(rb.color) : '#fff';
  return `<div class="fm-slot" onclick="fmMdexMarkOwned(${sp.dex},'${binderId}')" title="#${sp.dex} ${sp.name} (${c._setId.toUpperCase()} #${c.n}${rb?' · '+rb.label:''}) — clique pra marcar se tem/versão"
    style="aspect-ratio:2/3;border-radius:8px;overflow:hidden;position:relative;
           border:1px solid ${owned?color:'var(--border)'};box-shadow:${owned?`0 0 10px ${color}55`:'none'}">
    <img src="${imgSrc}" alt="${c.name}" loading="lazy" style="width:100%;height:100%;object-fit:cover;
      filter:${owned?'none':'grayscale(75%) brightness(.55)'}">
    ${owned?`<div style="position:absolute;top:3px;right:3px;width:15px;height:15px;background:${color};border-radius:50%;
      display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:700">✓</div>`:''}
    <div style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.6);color:#fff;font-size:7px;
      padding:1px 4px;border-radius:4px;font-family:'Space Mono',monospace">#${sp.dex}</div>
    <button onclick="event.stopPropagation();fmMdexOpenPicker(${sp.dex},'${binderId}')" title="Trocar qual carta representa essa espécie"
      style="position:absolute;bottom:3px;right:3px;width:22px;height:22px;touch-action:manipulation;border-radius:50%;border:none;z-index:1;
             background:rgba(0,0,0,.65);color:#fff;font-size:9px;line-height:1;cursor:pointer;
             display:flex;align-items:center;justify-content:center;padding:0">⇄</button>
    <div style="position:absolute;bottom:0;left:0;right:0;padding:3px 20px 3px 4px;background:linear-gradient(transparent,rgba(0,0,0,.85));
      font-size:6px;color:rgba(255,255,255,.7);font-family:'Space Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
      ${rb?`<span style="background:${rb.color};color:${rbInk};padding:0 3px;border-radius:2px;font-weight:700;margin-right:3px">${rb.code}</span>`:''}${c._setId.toUpperCase()} #${c.n}</div>
  </div>`;
}
window._fmMdexSlotHtml=fmMdexSlotHtml;

// Clique principal numa vaga preenchida: abre o MESMO modal de sempre
// (openSlotModal, de fichario_patch.js) pra marcar tem/não-tem + versão
// (N/F/RH/SP) + quantidade — grava direto no slot real da coleção
// (collected/Supabase), então o que for marcado aqui aparece igual no
// fichário normal do set (e vice-versa), sem estado duplicado.
function fmMdexMarkOwned(dex,binderId){
  const binder=fmMdexFindBinder(binderId);
  if(!binder) return;
  const cards=getBinderCards(binder);
  const card=cards.find(c=>c._dex===dex);
  if(!card){ fmMdexOpenPicker(dex,binderId); return; } // vaga vazia — cai pro picker de escolher carta
  if(typeof openSlotModal!=='function') return;
  openSlotModal(card.n, null, card._setId, card, ()=>fmMdexRefreshGrid());
}
window.fmMdexMarkOwned=fmMdexMarkOwned;

// ── Render especial: grid de 1025 vagas fixas (preenchidas ou vazias) ───────
function fmMdexRender(binder,keepFilters){
  const wrap=document.getElementById('bwrap');
  if(!wrap) return;
  fmMdexEnsureStyles();
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
             cursor:pointer;font-weight:${fmViewMode==='binder'?700:400};white-space:nowrap">📖 Fichário físico</button>
    <button onclick="fmMdexSetView('dash','${binder.id}')"
      style="padding:6px 10px;border-radius:6px;border:1px solid ${fmViewMode==='dash'?color:'var(--border)'};
             background:${fmViewMode==='dash'?color:'var(--surface2)'};
             color:${fmViewMode==='dash'?'#fff':'var(--muted)'};font-family:'Space Mono',monospace;font-size:10px;
             cursor:pointer;font-weight:${fmViewMode==='dash'?700:400};white-space:nowrap">📊 Dashboard</button>`;
  const fmPageSizeBtns=fmViewMode==='binder'?[2,3,4,5].map(n=>`<button onclick="fmMdexSetPageSize(${n},'${binder.id}')"
    style="padding:5px 10px;border-radius:6px;border:1px solid ${n===fmPageSize?'var(--gold)':'var(--border)'};
           background:var(--surface2);color:${n===fmPageSize?'var(--gold)':'var(--muted)'};
           font-family:'Space Mono',monospace;font-size:10px;cursor:pointer;
           font-weight:${n===fmPageSize?700:400}">${n===5?'4×5':n+'×'+n} por página</button>`).join(''):'';

  wrap.innerHTML=`
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      <button onclick="renderCustomBindersHome()" style="padding:6px 12px;background:var(--surface2);
        border:1px solid var(--border);border-radius:6px;color:var(--muted);font-family:'Space Mono',monospace;
        font-size:10px;cursor:pointer">← Voltar</button>
      <div style="font-size:26px">${binder.emoji||'🌐'}</div>
      <div style="flex:1;min-width:100px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:var(--text)">${binder.name}</div>
        <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${colCount}/${totalSlots} vagas preenchidas</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;min-width:120px">
        <div style="flex:1;height:4px;background:var(--surface3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .4s"></div>
        </div>
        <span style="font-size:10px;color:${color};font-family:'Space Mono',monospace;font-weight:700">${pct}%</span>
      </div>
    </div>
    <div class="bctl" style="gap:8px;flex-wrap:wrap;margin-bottom:10px;display:flex;align-items:center">
      <input class="bsrch fm-q" id="cb-view-q" type="search" inputmode="search" enterkeyhint="search" autocomplete="off"
        placeholder="Buscar: pikachu, 25, sv7 45, obf 125..." oninput="fmMdexSearchInput()"
        style="flex:1;min-width:140px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);
               background:var(--surface2);color:var(--text)">
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
    </div>
    <div style="font-size:9px;color:var(--muted);margin-bottom:10px;line-height:1.5">
      Uma vaga por espécie, na faixa #${allSpecies[0]?.dex??1}–#${allSpecies[allSpecies.length-1]?.dex??totalSlots} da Pokédex. Clique em qualquer vaga —
      preenchida ou vazia — pra escolher qual carta ocupa ela, entre todas as coleções cadastradas no site.
      Vaga sem carta escolhida mostra a imagem padrão do Pokémon — a carta só aparece depois que você escolhe.
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
  fmMdexEnsureStyles();
  if(document.getElementById('mmdexpick')) return;
  const ov=document.createElement('div');
  ov.className='ov'; ov.id='mmdexpick';
  ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('mmdexpick'); });
  ov.innerHTML=`<div class="modal modal-wide">
    <button class="mc-btn" onclick="closeModal('mmdexpick')">✕</button>
    <div id="mmdexpick-content"></div>
  </div>`;
  document.body.appendChild(ov);
}
// CORRIGIDO 29/07/2026: agora recebe binderId — a mesma vaga (mesmo #dex)
// pode existir em MAIS de um binder ao mesmo tempo (Nacional + regional que
// cobre aquela espécie), então precisa saber em qual está mexendo.
// REFEITO 04/11/2026 (relato: "tamanho das cartas pra selecionar está pequeno e desorganizado" + busca por código):
// antes era uma lista de miniaturas 36×50 sem busca (Pikachu tem 266 cartas). Agora é uma grade de cartas grandes
// (3 por linha no celular), com busca por nome/coleção/número (ex: "sv3 125", "obf 125", "125/230"), ordenação
// e filtro "só as que tenho". O estado fica em window._fmPick; fmMdexPickerRefresh() só redesenha a grade.
function fmMdexOpenPicker(dex,binderId){
  fmMdexEnsurePickerModal();
  const byDex=fmMdexCatalogByDex();
  const cands=(byDex[dex]||[]).map(x=>({
    setId:x.setId, card:x.card,
    owned:fmMdexIsOwned(x.setId,x.card),
    num:fmCardNum(x.card),
    hay:fmNorm((x.card.name||'')+' '+(x.card.rare||'')+' '+x.setId+' '+fmSetText(x.setId)+' '+(x.card.n||'')),
  }));
  const sp=(typeof POKEDEX_NACIONAL!=='undefined'?POKEDEX_NACIONAL:[]).find(s=>s.dex===dex);
  const binder=fmMdexFindBinder(binderId);
  const current=binder?(binder.card_ids||[]).find(r=>r.dex===dex):null;
  window._fmPick={dex,binderId,cands,current};
  const content=document.getElementById('mmdexpick-content');
  if(!content) return;
  content.innerHTML=`
    <h3 class="fm-pick-h">#${dex} ${sp?sp.name:''}</h3>
    <p class="fm-pick-sub" id="fm-pick-count"></p>
    <div class="fm-pick-bar">
      <input type="search" id="fm-pick-q" inputmode="search" enterkeyhint="search" autocomplete="off"
        placeholder="Buscar: sv3 125, obf 125, ex..." oninput="fmMdexPickerSearchInput()">
      <select id="fm-pick-sort" onchange="fmMdexPickerRefresh()" aria-label="Ordenar">
        <option value="price-asc">Menor preço</option>
        <option value="price-desc">Maior preço</option>
        <option value="set">Coleção</option>
        <option value="num">Número</option>
      </select>
      <label><input type="checkbox" id="fm-pick-own" onchange="fmMdexPickerRefresh()">Só as que tenho</label>
    </div>
    <div class="fm-pick-grid" id="fm-pick-grid"></div>
    ${current?`<button class="fm-pick-rm" onclick="fmMdexRemoveSlot(${dex},'${binderId}')">🗑️ deixar esta vaga vazia (volta para a imagem padrão)</button>`:''}`;
  fmMdexPickerRefresh();
  openModal('mmdexpick');
  const grid=document.getElementById('fm-pick-grid'); if(grid) grid.scrollTop=0;
}
window.fmMdexOpenPicker=fmMdexOpenPicker;
let _fmPQT=null;
function fmMdexPickerSearchInput(){ clearTimeout(_fmPQT); _fmPQT=setTimeout(()=>fmMdexPickerRefresh(),150); }
window.fmMdexPickerSearchInput=fmMdexPickerSearchInput;
function fmMdexPickerRefresh(){
  const st=window._fmPick; if(!st) return;
  const grid=document.getElementById('fm-pick-grid'); if(!grid) return;
  const q=(document.getElementById('fm-pick-q')?.value||'').trim();
  const sort=document.getElementById('fm-pick-sort')?.value||'price-asc';
  const onlyOwn=document.getElementById('fm-pick-own')?.checked||false;
  const pq=q?fmParseQuery(q):null;
  const meta=fmSetIndex().meta;
  let list=st.cands.filter(x=>(!onlyOwn||x.owned)&&(!pq||fmQueryMatch(pq,{hay:x.hay,set:x.setId,num:x.num,dex:null})));
  const price=x=>fmMdexPrice(x.card);
  const setOrd=x=>meta[x.setId]?meta[x.setId].order:9999;
  list.sort((a,b)=>{
    if(sort==='price-desc'){ const pa=isFinite(price(a))?price(a):-1, pb=isFinite(price(b))?price(b):-1; return pb-pa; }
    if(sort==='set') return setOrd(a)-setOrd(b) || (a.num??0)-(b.num??0);
    if(sort==='num') return (a.num??1e9)-(b.num??1e9) || setOrd(a)-setOrd(b);
    return price(a)-price(b) || setOrd(a)-setOrd(b);   // menor preço (sem preço vai pro fim)
  });
  const cnt=document.getElementById('fm-pick-count');
  if(cnt) cnt.textContent=(list.length===st.cands.length
    ? `${st.cands.length} carta(s) desta espécie em todas as coleções do site.`
    : `${list.length} de ${st.cands.length} carta(s) com esse filtro.`)+' Toque na carta para escolher qual ocupa a vaga.';
  if(!list.length){
    grid.innerHTML=`<div class="fm-pick-empty">${st.cands.length?'Nenhuma carta com essa busca. Tente só o código da coleção (ex: <b>sv3</b>) ou só o número.':'Nenhuma carta cadastrada pra essa espécie ainda em nenhuma coleção do site.'}</div>`;
    return;
  }
  const cur=st.current;
  grid.innerHTML=list.map(x=>{
    const isCur=cur&&cur.set===x.setId&&String(cur.n)===String(x.card.n);
    const p=isFinite(price(x))?('R$'+price(x).toFixed(2).replace('.',',')):'sem preço';
    const raw=(typeof getBinderImg==='function')?getBinderImg(x.card,x.setId):'';
    const img=(typeof imgThumb==='function')?imgThumb(raw):raw;
    const m=meta[x.setId];
    return `<button type="button" class="fm-pick-card${isCur?' cur':''}" onclick="fmMdexChooseCard(${st.dex},'${x.setId}','${String(x.card.n).replace(/'/g,"\'")}','${st.binderId}')"
      title="${(x.card.name||'').replace(/"/g,'&quot;')} — ${x.setId.toUpperCase()} #${x.card.n}">
      <div class="fm-pick-img"><img loading="lazy" decoding="async" alt="${(x.card.name||'').replace(/"/g,'&quot;')}" src="${img}">
        ${x.owned?'<span class="fm-pick-own">✓ tenho</span>':''}${isCur?'<span class="fm-pick-cur">atual</span>':''}</div>
      <div class="fm-pick-name">${x.card.name||''}</div>
      <div class="fm-pick-meta">${m?m.short:x.setId.toUpperCase()} · #${x.card.n}${x.card.rare?'<br>'+x.card.rare:''}</div>
      <div class="fm-pick-price">${p}</div>
    </button>`;
  }).join('');
}
window.fmMdexPickerRefresh=fmMdexPickerRefresh;

// CORRIGIDO 02/11/2026: devolve true/false. Se o banco recusar a gravação (saveCustomBinder agora avisa e
// devolve null), quem chamou desfaz a mudança na tela — antes a escolha ficava "salva" só na memória e sumia
// ao voltar.
async function fmMdexPersist(binder){
  const saved=await saveCustomBinder(binder);
  if(!saved) return false;
  const idx=(customBinders||[]).findIndex(b=>b.id===binder.id);
  if(idx>=0) customBinders[idx]=binder;
  return true;
}
async function fmMdexChooseCard(dex,setId,n,binderId){
  const binder=fmMdexFindBinder(binderId);
  if(!binder) return;
  const prev=binder.card_ids||[];
  binder.card_ids=prev.filter(r=>r.dex!==dex);
  binder.card_ids.push({set:setId,n:String(n),dex});
  if(!(await fmMdexPersist(binder))) binder.card_ids=prev;
  closeModal('mmdexpick');
  fmMdexRender(binder,true);
}
window.fmMdexChooseCard=fmMdexChooseCard;
async function fmMdexRemoveSlot(dex,binderId){
  const binder=fmMdexFindBinder(binderId);
  if(!binder) return;
  const prev=binder.card_ids||[];
  binder.card_ids=prev.filter(r=>r.dex!==dex);
  if(!(await fmMdexPersist(binder))) binder.card_ids=prev;
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
  // NOVO 30/07/2026 (pedido do Eduardo: imprimir só o que a tela está
  // mostrando — respeita "Só coletadas"/"Só faltantes" também no Master Set)
  const onlyState=typeof _printOnlyState==='function'?_printOnlyState():undefined;
  // 04/11/2026: o PDF segue o tamanho de página escolhido AQUI no Master Set (2×2 … 4×5), não o do fichário oficial
  // (ficBinderSize é global; printBinder lê o valor na 1ª linha, antes de qualquer await, então dá pra restaurar já).
  let prevSize=null;
  try{ prevSize=ficBinderSize; ficBinderSize=window._fmMdexPageSize||3; }catch(e){ prevSize=null; }
  try{ printBinder(cards, c=>c._setId, binder.name, onlyState); }
  finally{ if(prevSize!=null){ try{ ficBinderSize=prevSize; }catch(e){} } }
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
      <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${pct}% das ${total} espécies coletadas · ${col}/${total} vagas preenchidas — clique pra continuar</div>
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
