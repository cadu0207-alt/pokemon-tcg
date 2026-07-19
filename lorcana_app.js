// ================================================================
// Lorcana Dashboard — lorcana_app.js (alpha v1)
// Reaproveita o MESMO projeto/sessão Supabase do MyDeck Pokémon
// (mesmo login Google), mas grava em tabelas próprias — nenhuma
// tabela do Pokémon é lida ou escrita por este arquivo:
//   lorcana_purchases, lorcana_pulled_cards, lorcana_collection
// Ver lorcana_setup.sql para o schema e [[project_lorcana_expansion]]
// na memória do projeto para o histórico completo da decisão.
//
// v1 SIMPLIFICADO DE PROPÓSITO (alpha, "devagar pra não quebrar nada"):
//  - 1 slot por carta (sem separar Normal/Foil como no fichário Pokémon)
//  - Sem fichários personalizados, sem compartilhamento por link
//  - Preço: cada carta tem `Price` em USD (vindo da Lorcast, prices.usd —
//    fallback prices.usd_foil quando usd é null), populado direto nos
//    cards_lorcana_setN.js. A conversão pra BRL acontece AO VIVO aqui embaixo
//    via USD_BRL (mesmo padrão do fetchCambio() do Pokémon), então nunca
//    fica desatualizada. Ver priceBRL().
// ================================================================
const SUPABASE_URL='https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SUPABASE_KEY='sb_publishable_f4d1JHAzTWPWYAI0Vm6aRA_NwM-uzr3';
const sbClient=window.supabase?window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY):null;
let currentUser=null;
function uid(){return currentUser?.id||null;}

// ── AUTH (mesmo fluxo do app.js do Pokémon — mesma sessão) ───────
async function signInGoogle(){
  await sbClient.auth.signInWithOAuth({
    provider:'google',
    options:{redirectTo:window.location.href.split('?')[0].split('#')[0]}
  });
}
async function signOut(){
  await sbClient.auth.signOut();
  currentUser=null;
  _showAuth(true);
}
function _showAuth(show){
  const ov=document.getElementById('auth-overlay');
  if(ov) ov.style.display=show?'flex':'none';
}
function _updateUserChip(user){
  const chip=document.getElementById('user-chip');
  if(!chip) return;
  chip.style.display=user?'flex':'none';
  if(!user) return;
  const m=user.user_metadata||{};
  const av=document.getElementById('user-avatar');
  const nm=document.getElementById('user-display-name');
  if(av) av.src=m.avatar_url||m.picture||'';
  if(nm) nm.textContent=(m.full_name||m.name||user.email||'').split(' ')[0];
}
if(sbClient){
  sbClient.auth.onAuthStateChange((_event,session)=>{
    currentUser=session?.user??null;
    _updateUserChip(currentUser);
    if(currentUser){
      _showAuth(false);
      if(document.readyState==='complete'||document.readyState==='interactive') loadAll();
      else document.addEventListener('DOMContentLoaded',()=>loadAll());
    }else{
      _showAuth(true);
    }
  });
}else{
  document.addEventListener('DOMContentLoaded',()=>{
    const b=document.createElement('div');
    b.style.cssText='position:fixed;inset:0;z-index:99999;background:#0a0614;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:sans-serif;text-align:center;padding:24px';
    b.innerHTML='<div style="font-size:40px">⚠️</div><div style="font-size:18px;font-weight:600">Não foi possível conectar ao MyDeck</div>'+
      '<div style="font-size:13px;color:#9aa">O serviço de dados (Supabase) não carregou. Verifique sua conexão e recarregue.</div>'+
      '<button onclick="location.reload()" style="margin-top:8px;padding:10px 20px;background:#8a6dcf;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">Recarregar</button>';
    document.body.appendChild(b);
  });
}

// ── CÂMBIO (mesmo padrão do fetchCambio() do app.js Pokémon) ─────
let USD_BRL=5.70;
async function fetchCambio(){
  try{
    const r=await fetch('https://open.er-api.com/v6/latest/USD');
    const d=await r.json();
    if(d?.rates?.BRL)USD_BRL=d.rates.BRL;
    const el=document.getElementById('usd-brl');
    if(el)el.textContent=`USD/BRL R$${USD_BRL.toFixed(2)}`;
  }catch(e){}
}
setInterval(()=>{ if(document.visibilityState==='visible') fetchCambio(); }, 30*60*1000);
// Converte um preço em USD (vindo da Lorcast) pra BRL, arredondado a centavos.
function priceBRL(usd){ return(usd||usd===0)?+(usd*USD_BRL).toFixed(2):null; }

// ── CAPÍTULOS (SETS) ──────────────────────────────────────────────
// Nomes/códigos conferidos direto na resposta da lorcana-api.com (Unique_ID
// de cada carta), não são "achismo" — ver cabeçalho de cada cards_lorcana_setN.js.
const LORCANA_META=[
  {id:1, code:'TFC', label:'The First Chapter'},
  {id:2, code:'ROF', label:'Rise of the Floodborn'},
  {id:3, code:'INK', label:'Into the Inklands'},
  {id:4, code:'URS', label:"Ursula's Return"},
  {id:5, code:'SSK', label:'Shimmering Skies'},
  {id:6, code:'AZS', label:'Azurite Sea'},
  {id:7, code:'ARI', label:"Archazia's Island"},
  {id:8, code:'ROJ', label:'Reign of Jafar'},
  {id:9, code:'FAB', label:'Fabled'},
  {id:10,code:'WHI', label:'Whispers in the Well'},
  {id:11,code:'WIN', label:'Winterspell'},
  {id:12,code:'WUN', label:'Wilds Unknown'},
  {id:13,code:'???', label:'Attack of the Vine!'}, // lançou 17/jul/2026, ainda sem catálogo na API
];

// IMPORTANTE: os cards_lorcana_setN.js declaram os arrays com `const`, e
// `const`/`let` no escopo global NÃO viram propriedades de `window` (só `var`
// vira) — por isso não dá pra usar window['CARDS_LORCANA_SET'+id] aqui. Fix:
// switch com referência direta a cada nome, mesmo padrão já usado no app.js
// do Pokémon (typeof CARDS_ME03!=='undefined'?CARDS_ME03:[]).
function setCards(id){
  switch(id){
    case 1: return typeof CARDS_LORCANA_SET1!=='undefined'?CARDS_LORCANA_SET1:[];
    case 2: return typeof CARDS_LORCANA_SET2!=='undefined'?CARDS_LORCANA_SET2:[];
    case 3: return typeof CARDS_LORCANA_SET3!=='undefined'?CARDS_LORCANA_SET3:[];
    case 4: return typeof CARDS_LORCANA_SET4!=='undefined'?CARDS_LORCANA_SET4:[];
    case 5: return typeof CARDS_LORCANA_SET5!=='undefined'?CARDS_LORCANA_SET5:[];
    case 6: return typeof CARDS_LORCANA_SET6!=='undefined'?CARDS_LORCANA_SET6:[];
    case 7: return typeof CARDS_LORCANA_SET7!=='undefined'?CARDS_LORCANA_SET7:[];
    case 8: return typeof CARDS_LORCANA_SET8!=='undefined'?CARDS_LORCANA_SET8:[];
    case 9: return typeof CARDS_LORCANA_SET9!=='undefined'?CARDS_LORCANA_SET9:[];
    case 10:return typeof CARDS_LORCANA_SET10!=='undefined'?CARDS_LORCANA_SET10:[];
    case 11:return typeof CARDS_LORCANA_SET11!=='undefined'?CARDS_LORCANA_SET11:[];
    case 12:return typeof CARDS_LORCANA_SET12!=='undefined'?CARDS_LORCANA_SET12:[];
    case 13:return typeof CARDS_LORCANA_SET13!=='undefined'?CARDS_LORCANA_SET13:[];
    default:return[];
  }
}
function normCard(raw){
  // priceUsd vem cru da Lorcast (raw.Price) — use priceBRL(c.priceUsd) pra exibir em R$.
  return{n:raw.Card_Num,uid:raw.Unique_ID,name:raw.Name,cost:raw.Cost,color:raw.Color,
    type:raw.Type,rarity:raw.Rarity,lore:raw.Lore,img:raw.Image,priceUsd:raw.Price??null};
}
function slotKey(setId,n){return`${setId}:${n}`;}

// ── CORES ──────────────────────────────────────────────────────
const INK_COLOR={Amber:'#e8a33d',Amethyst:'#a855f7',Emerald:'#1fa679',Ruby:'#e6484f',Sapphire:'#3b82f6',Steel:'#94a3b8'};
function inkColor(color){
  const first=(color||'').split(',')[0].trim();
  return INK_COLOR[first]||'#8a6dcf';
}
const RARITY_COLOR={Common:'#9086b0',Uncommon:'#6bcf8e',Rare:'#3b82f6','Super Rare':'#a855f7',Legendary:'#e9c873',Enchanted:'#ff6bd6'};
const RARITY_SHORT={Common:'C',Uncommon:'UC',Rare:'R','Super Rare':'SR',Legendary:'L',Enchanted:'ENC'};

// ── ESTADO ──────────────────────────────────────────────────────
let purchases=[],pulledCards=[],collected=new Set();
let currentSet=1;

// ── CARREGAR ──────────────────────────────────────────────────────
async function loadAll(){
  setStatus('Conectando...','warning');
  if(!uid()){setStatus('Faça login','warning');return;}
  try{
    const myUid=uid();
    const[{data:p},{data:c},{data:col}]=await Promise.all([
      sbClient.from('lorcana_purchases').select('*').eq('user_id',myUid).order('date',{ascending:false}),
      sbClient.from('lorcana_pulled_cards').select('*').eq('user_id',myUid).order('id',{ascending:true}),
      sbClient.from('lorcana_collection').select('slot_key').eq('user_id',myUid)
    ]);
    purchases=Array.isArray(p)?p:[];
    pulledCards=Array.isArray(c)?c:[];
    collected=new Set((Array.isArray(col)?col:[]).map(r=>r.slot_key));
    setStatus('Online ✓','ok');
    fetchCambio();
    renderTabs();
    renderBinder();
    renderDash();
  }catch(e){setStatus('Erro de conexão','error');console.error(e);}
}
function setStatus(txt,state){
  const el=document.getElementById('status-txt');if(el)el.textContent=txt;
  const dot=document.getElementById('status-dot');if(dot)dot.className=`dot dot-${state}`;
}

// ── TOGGLE SLOT (fichário) ────────────────────────────────────────
async function toggleSlot(key){
  if(!uid()) return;
  const was=collected.has(key);
  let error=null;
  if(was){
    collected.delete(key);
    ({error}=await sbClient.from('lorcana_collection').delete().eq('slot_key',key).eq('user_id',uid()));
  }else{
    collected.add(key);
    ({error}=await sbClient.from('lorcana_collection').upsert({slot_key:key,user_id:uid()},{onConflict:'user_id,slot_key'}));
  }
  if(error){
    if(was)collected.add(key);else collected.delete(key);
    console.error('Erro ao salvar coleção Lorcana:',error);
    setStatus('Erro ao salvar — tente novamente','error');
    alert('Não foi possível salvar essa carta no fichário. Verifique sua conexão e tente de novo.');
    return;
  }
  renderBinder();
  const dash=document.getElementById('dash');
  if(dash&&dash.classList.contains('active'))renderDash();
}

// ── NAVEGAÇÃO DE ABAS ──────────────────────────────────────────────
function go(id,el){
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const pane=document.getElementById(id);
  if(pane)pane.classList.add('active');
  if(el){el.classList.add('active');}
  else{
    const order=['dash','fichario','gastos','cartas','preco'];
    const tabs=document.querySelectorAll('.tab');
    const idx=order.indexOf(id);
    if(tabs[idx])tabs[idx].classList.add('active');
  }
  if(id==='fichario')renderBinder();
  if(id==='dash')renderDash();
  if(id==='cartas')renderCartas();
  if(id==='gastos')renderGastos();
  if(id==='preco')renderPreco();
}
function goFichario(setId){currentSet=setId;renderTabs();go('fichario');}

// ── UTILS ────────────────────────────────────────────────────────
const fmtR=v=>(+v||0).toFixed(2).replace('.',',');
const kpiHTML=(cls,lbl,val,sub)=>`<div class="kpi ${cls}"><div class="kpi-label">${lbl}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div></div>`;
const barHTML=(lbl,v,max,color,txt,dot='')=>{const w=max>0?Math.round(v/max*100):0;
  return`<div class="brow"><div class="blbl">${dot}${lbl}</div><div class="btrack"><div class="bfill" style="width:${w}%;background:${color}">${txt}</div></div></div>`;};

function openModal(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.add('open');
  if(id==='mp')document.getElementById('m-data').value=new Date().toISOString().split('T')[0];
}
function closeModal(id){const el=document.getElementById(id);if(el)el.classList.remove('open');}

// ── FICHÁRIO — TABS ────────────────────────────────────────────────
function renderTabs(){
  const container=document.getElementById('binder-tabs');
  if(!container)return;
  container.innerHTML=LORCANA_META.map(m=>{
    const n=setCards(m.id).length;
    const isActive=currentSet===m.id;
    return`<div class="ctab${isActive?' active':''}" onclick="goFichario(${m.id})" ${n===0?'style="opacity:.55"':''}>
      ${m.code} <span class="ctab-n">${n||'em breve'}</span></div>`;
  }).join('');
}

// ── FICHÁRIO — GRID ─────────────────────────────────────────────────
function renderBinder(){
  const meta=LORCANA_META.find(m=>m.id===currentSet);
  const rawCards=setCards(currentSet);
  const info=document.getElementById('fic-set-info');
  if(info)info.textContent=meta?`${meta.code} — ${meta.label} · ${rawCards.length} carta${rawCards.length!==1?'s':''}`:'';
  const grid=document.getElementById('lf-grid');
  if(!grid)return;
  if(!rawCards.length){
    grid.innerHTML=`<div class="lf-empty" style="grid-column:1/-1">Este capítulo ainda não está catalogado pela API de dados — assim que sair, aparece aqui automaticamente.</div>`;
    updateBinderStats();
    return;
  }
  const q=(document.getElementById('bsrch')?.value||'').toLowerCase();
  const oc=document.getElementById('fc')?.checked;
  const om=document.getElementById('fm')?.checked;
  const visible=rawCards.filter(raw=>{
    if(q&&!(raw.Name||'').toLowerCase().includes(q))return false;
    const has=collected.has(slotKey(currentSet,raw.Card_Num));
    if(oc&&!has)return false;
    if(om&&has)return false;
    return true;
  });
  grid.innerHTML=visible.map(raw=>{
    const c=normCard(raw);
    const key=slotKey(currentSet,c.n);
    const has=collected.has(key);
    const ink=inkColor(c.color);
    const rc=RARITY_COLOR[c.rarity]||'#9086b0';
    const priceBrl=priceBRL(c.priceUsd);
    return`<div class="lf-card${has?' owned':''}" onclick="openLorcanaCardModal(${currentSet},'${c.n}')" title="${c.name} — clique pra ampliar">
      <div class="lf-cost" style="background:${ink}">${c.cost??''}</div>
      <div class="lf-check" onclick="event.stopPropagation();toggleSlot('${key}')" title="Marcar/desmarcar coletada">${has?'✓':''}</div>
      <img src="${c.img}" alt="${c.name}" loading="lazy" onerror="this.style.opacity='.15'">
      <div class="lf-info"><div class="lf-name">${c.name}</div>
        <div class="lf-rar" style="color:${rc}">${c.rarity||''}</div>
        ${priceBrl?`<div class="lf-price">R$${fmtR(priceBrl)}</div>`:''}</div>
    </div>`;
  }).join('')||`<div class="lf-empty" style="grid-column:1/-1">Nenhuma carta encontrada com esse filtro.</div>`;
  updateBinderStats();
  applyGridSize();
}

// ── FICHÁRIO — TAMANHO DO GRID (2/3/4 por linha, persistido) ────────
let ficGridSize=parseInt(localStorage.getItem('lorcana_grid_size'))||3;
const GRID_MINW={2:210,3:150,4:110};
function setGridSize(n){
  ficGridSize=n;
  try{localStorage.setItem('lorcana_grid_size',n);}catch(e){}
  applyGridSize();
}
function applyGridSize(){
  const grid=document.getElementById('lf-grid');
  if(grid)grid.style.gridTemplateColumns=`repeat(auto-fill,minmax(${GRID_MINW[ficGridSize]||150}px,1fr))`;
  document.querySelectorAll('.gsize-btn').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('gsize-'+ficGridSize);
  if(btn)btn.classList.add('active');
}

// ── FICHÁRIO — MODAL DE ZOOM DA CARTA ────────────────────────────────
function openLorcanaCardModal(setId,n){
  const raw=setCards(setId).find(x=>String(x.Card_Num)===String(n));
  if(!raw)return;
  const c=normCard(raw);
  const key=slotKey(setId,c.n);
  const has=collected.has(key);
  const ink=inkColor(c.color);
  const rc=RARITY_COLOR[c.rarity]||'#9086b0';
  const meta=LORCANA_META.find(m=>m.id===setId);
  const priceBrl=priceBRL(c.priceUsd);
  document.getElementById('card-zoom-content').innerHTML=`
    <img class="cz-img" src="${c.img}" alt="${c.name}" onerror="this.style.display='none'">
    <div class="cz-body">
      <div class="cz-title">${c.name}</div>
      <div class="cz-sub">${meta?meta.code:''} · #${c.n}${c.type?' · '+c.type:''}</div>
      <div class="cz-badges">
        <span class="cz-badge" style="border-color:${ink};color:${ink}">${c.color||'—'}</span>
        <span class="cz-badge" style="border-color:${rc};color:${rc}">${c.rarity||'—'}</span>
        <span class="cz-badge">💧 Custo ${c.cost??'—'}</span>
        ${c.lore?`<span class="cz-badge" style="border-color:var(--gold);color:var(--gold)">💎 ${c.lore} lore</span>`:''}
      </div>
      <div class="cz-price">${priceBrl?'R$'+fmtR(priceBrl):'Preço indisponível'}</div>
      <button class="btn-add" style="width:100%;margin-top:16px" onclick="toggleSlot('${key}');openLorcanaCardModal(${setId},'${c.n}')">
        ${has?'✓ Coletada — clique pra remover':'+ Marcar como coletada'}</button>
    </div>`;
  openModal('card-zoom');
}
function updateBinderStats(){
  let grand=0,grandC=0;
  LORCANA_META.forEach(m=>{
    const cards=setCards(m.id);
    grand+=cards.length;
    cards.forEach(raw=>{if(collected.has(slotKey(m.id,raw.Card_Num)))grandC++;});
  });
  const pct=grand>0?(grandC/grand*100).toFixed(1):0;
  const el=document.getElementById('binder-stats');
  if(!el)return;
  el.innerHTML=`
    <div><div class="bsv" style="color:var(--teal)">${grandC}</div><div class="bsl">Cartas Coletadas</div></div>
    <div><div class="bsv" style="color:var(--muted)">${grand}</div><div class="bsl">Total · 13 Capítulos</div></div>
    <div style="flex:1;min-width:180px">
      <div style="height:6px;background:var(--surface2);border-radius:3px;margin-bottom:5px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:3px"></div></div>
      <div class="bsl"><span style="color:var(--teal)">${pct}%</span> DE TODOS OS CAPÍTULOS</div>
    </div>`;
}

// ── VALOR DO FICHÁRIO ────────────────────────────────────────────
// raw.Price vem em USD (Lorcast) — converte pra BRL na hora com o câmbio atual.
function calcCollectedValue(){
  let total=0;
  LORCANA_META.forEach(m=>{
    setCards(m.id).forEach(raw=>{
      if(collected.has(slotKey(m.id,raw.Card_Num))&&raw.Price)total+=raw.Price*USD_BRL;
    });
  });
  return total;
}

// ── DASHBOARD ────────────────────────────────────────────────────
function renderDash(){
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const bst=purchases.filter(p=>!p.acessorio);
  const tb=bst.reduce((s,p)=>s+Number(p.boost||0),0);
  const tg=bst.reduce((s,p)=>s+Number(p.price),0);
  const fichVal=calcCollectedValue();
  const roi=invested>0?(fichVal/invested*100).toFixed(0):0;
  const apb=tb>0?(tg/tb).toFixed(2):'0,00';
  const kpi=document.getElementById('kpi-dash');
  if(kpi)kpi.innerHTML=
    kpiHTML('red','💰 Total Investido','R$'+fmtR(invested),purchases.length+' compras')+
    kpiHTML('orange','📦 Boosters',''+tb,'~'+(tb*12)+' cartas')+
    kpiHTML('gold','💵 R$/Booster','R$'+apb.replace('.',','),'média ponderada')+
    kpiHTML('teal','📚 Valor Fichário','R$'+fmtR(fichVal),collected.size+' cartas coletadas')+
    kpiHTML('blue','📊 Retorno',roi+'%','fichário ÷ investido');
  renderInkChart();
  renderRarityChart();
  renderGastosChart();
  renderProgressSets();
  renderHighlights();
}
function renderInkChart(){
  const el=document.getElementById('chart-ink');
  if(!el)return;
  const counts={};
  LORCANA_META.forEach(m=>{
    setCards(m.id).forEach(raw=>{
      if(!collected.has(slotKey(m.id,raw.Card_Num)))return;
      const first=(raw.Color||'').split(',')[0].trim()||'—';
      counts[first]=(counts[first]||0)+1;
    });
  });
  const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(...entries.map(e=>e[1]),1);
  el.innerHTML=entries.length?entries.map(([k,v])=>{
    const col=INK_COLOR[k]||'#8a6dcf';
    const dot=`<div style="width:9px;height:9px;border-radius:2px;background:${col};flex-shrink:0"></div>`;
    return barHTML(k,v,max,col,''+v,dot);
  }).join(''):`<div style="color:var(--muted);font-size:12px;padding:8px">Nenhuma carta coletada ainda</div>`;
}
function renderRarityChart(){
  const el=document.getElementById('chart-rarity');
  if(!el)return;
  const counts={};
  pulledCards.forEach(c=>{const r=c.rar||'Common';counts[r]=(counts[r]||0)+1;});
  const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(...entries.map(e=>e[1]),1);
  el.innerHTML=entries.length?entries.map(([k,v])=>{
    const col=RARITY_COLOR[k]||'#9086b0';
    const dot=`<div style="width:9px;height:9px;border-radius:2px;background:${col};flex-shrink:0"></div>`;
    return barHTML(k,v,max,col,''+v,dot);
  }).join(''):`<div style="color:var(--muted);font-size:12px;padding:8px">Sem cartas tiradas ainda</div>`;
}
function renderGastosChart(){
  const el=document.getElementById('chart-gastos');
  if(!el)return;
  const byDate={};
  purchases.forEach(p=>{byDate[p.date]=(byDate[p.date]||0)+Number(p.price);});
  const entries=Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0]));
  const max=Math.max(...entries.map(e=>e[1]),1);
  el.innerHTML=entries.map(([d,v])=>barHTML(d.slice(5),v,max,'linear-gradient(90deg,var(--accent),var(--accent2))','R$'+fmtR(v))).join('')||
    `<div style="color:var(--muted);font-size:12px;padding:8px">Sem compras ainda</div>`;
}
function renderProgressSets(){
  const el=document.getElementById('progress-sets');
  if(!el)return;
  el.innerHTML=LORCANA_META.map(m=>{
    const cards=setCards(m.id);
    const tot=cards.length;
    let col=0;
    cards.forEach(raw=>{if(collected.has(slotKey(m.id,raw.Card_Num)))col++;});
    const pct=tot>0?(col/tot*100).toFixed(0):0;
    return`<div class="panel" style="overflow:hidden;position:relative;${tot?'':'opacity:.6'}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="flex:1"><div style="font-weight:700;font-size:13px">${m.code} — ${m.label}</div>
        <div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">${tot?tot+' cartas':'em breve'}</div></div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--gold);line-height:1">${tot?pct+'%':'?'}</div>
      </div>
      ${tot?`<div class="prog"><div class="prog-lbl"><span>Coletadas</span><span>${col}/${tot}</span></div>
        <div class="prog-t"><div class="prog-f" style="width:${pct}%;background:var(--accent)"></div></div></div>`:''}
    </div>`;
  }).join('');
}
function renderHighlights(){
  const el=document.getElementById('dash-highlights');
  if(!el)return;
  const pool=[];
  LORCANA_META.forEach(m=>{
    setCards(m.id).forEach(raw=>{
      if(collected.has(slotKey(m.id,raw.Card_Num)))pool.push({...normCard(raw),setId:m.id,setCode:m.code});
    });
  });
  const picked=pool.sort(()=>Math.random()-0.5).slice(0,6);
  el.innerHTML=picked.length?picked.map(c=>{
    const rc=RARITY_COLOR[c.rarity]||'#9086b0';
    return`<div class="pc" onclick="goFichario(${c.setId})">
      <img class="pc-img" src="${c.img}" alt="${c.name}" onerror="this.style.display='none'">
      <div class="pc-info"><div class="pc-name">${c.name}</div>
        <div class="pc-meta">${c.setCode} · ${c.n}</div></div>
      <div class="pc-right"><span class="rb" style="background:${rc}22;color:${rc};border-color:${rc}">${RARITY_SHORT[c.rarity]||''}</span></div>
    </div>`;
  }).join(''):`<div style="color:var(--muted);padding:16px;font-size:.85rem">Nenhuma carta coletada no fichário ainda.</div>`;
}

// ── GASTOS ──────────────────────────────────────────────────────
function renderGastos(){
  const total=purchases.reduce((s,p)=>s+Number(p.price),0);
  const bst=purchases.filter(p=>!p.acessorio);
  const tb=bst.reduce((s,p)=>s+Number(p.boost||0),0);
  const tc=bst.reduce((s,p)=>s+Number(p.cards||0),0);
  const tg=bst.reduce((s,p)=>s+Number(p.price),0);
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const roi=total>0?(pull/total*100).toFixed(0):0;
  const apb=tb>0?(tg/tb).toFixed(2):'0,00';
  const apc=tc>0?(tg/tc).toFixed(2):'0,00';
  const resumo=document.getElementById('gastos-resumo');
  if(resumo)resumo.innerHTML=`<div class="kpi-grid">
    ${kpiHTML('red','💰 Total Investido','R$'+fmtR(total),purchases.length+' compras · '+tb+' boosters')}
    ${kpiHTML('gold','📦 R$/Booster','R$'+apb.replace('.',','),'média ponderada')}
    ${kpiHTML('orange','🃏 R$/Carta','R$'+apc.replace('.',','),'~'+tc+' cartas')}
    ${kpiHTML('teal','💎 Valor Tirado','R$'+fmtR(pull),pulledCards.length+' cartas')}
    ${kpiHTML('blue','📊 Retorno',roi+'%',pull>=total?'✅ acima do gasto':'📉 abaixo do gasto')}
  </div>`;
  const cardsEl=document.getElementById('gastos-cards');
  if(cardsEl)cardsEl.innerHTML=purchases.map(p=>{
    const pb=p.boost>0?(Number(p.price)/p.boost).toFixed(2):null;
    const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
    return`<div class="pcard"><div class="pcard-body" style="padding:18px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:10px;padding:3px 9px;border-radius:12px;background:var(--surface3);color:var(--accent2);font-family:'Space Mono',monospace">${p.tipo}</span>
            <span style="font-size:11px;color:var(--muted);font-family:'Space Mono',monospace">${d}</span>
            ${p.acessorio?'<span style="font-family:\'Space Mono\',monospace;font-size:9px;color:var(--muted);background:rgba(154,134,197,.15);padding:2px 7px;border-radius:10px">ACESSÓRIO</span>':''}
          </div>
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p.product}</div>
          ${p.boost>0?`<div style="font-size:11px;color:var(--muted)">${p.boost} booster${p.boost!==1?'s':''} · ~${p.cards||p.boost*12} cartas</div>`:''}
        </div>
        <div style="display:flex;gap:16px;align-items:center">
          <div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--accent);line-height:1">R$${fmtR(p.price)}</div>
            <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">PAGO</div></div>
          ${pb?`<div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:26px;color:var(--gold);line-height:1">R$${pb.replace('.',',')}</div>
            <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">POR BOOSTER</div></div>`:''}
        </div>
      </div>
    </div></div>`;
  }).join('')||`<div style="color:var(--muted);padding:20px;text-align:center;font-size:12px">Nenhuma compra registrada ainda.</div>`;
  const tl=document.getElementById('tlwrap');
  if(tl)tl.innerHTML=[...purchases].reverse().map(p=>{
    const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
    const pb=p.boost>0?(Number(p.price)/p.boost).toFixed(2):null;
    return`<div class="tli"><div class="tl-date">${d}</div><div class="tl-desc">${p.product}</div>
      <div class="tl-amt">R$${fmtR(p.price)}${pb?` · <span style="color:var(--gold)">R$${pb.replace('.',',')}/booster</span>`:''}</div></div>`;
  }).join('');
}
async function addPurchase(){
  if(!uid())return;
  const prod=document.getElementById('m-prod').value.trim();
  const tipo=document.getElementById('m-tipo').value;
  const date=document.getElementById('m-data').value;
  const price=parseFloat(document.getElementById('m-preco').value);
  const boost=parseInt(document.getElementById('m-boost').value)||0;
  const acess=document.getElementById('m-acess').checked;
  if(!prod||isNaN(price))return;
  const{data:res,error}=await sbClient.from('lorcana_purchases').insert(
    {date,product:prod,tipo,boost,cards:boost*12,price,acessorio:acess,user_id:uid()}).select();
  if(error){alert('Erro ao salvar compra: '+error.message);return;}
  if(Array.isArray(res))purchases.unshift(...res);
  closeModal('mp');renderGastos();renderDash();
}

// ── CARTAS TIRADAS ───────────────────────────────────────────────
const RARITY_ICON={Common:'⚪',Uncommon:'🟢',Rare:'🔵','Super Rare':'🟣',Legendary:'🟡',Enchanted:'✨'};
function renderCartas(){
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const roi=invested>0?(pull/invested*100).toFixed(0):0;
  const hdr=document.getElementById('cards-hdr');
  if(hdr)hdr.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:22px">
    ${kpiHTML('teal','💎 Valor Tirado','R$'+fmtR(pull),pulledCards.length+' cartas')}
    ${kpiHTML('gold','📊 % Investimento',roi+'%','de R$'+fmtR(invested))}
    ${kpiHTML('red','🛍️ Investido','R$'+fmtR(invested),purchases.length+' compras')}
  </div>`;
  const list=document.getElementById('cards-list');
  if(!list)return;
  if(!pulledCards.length){
    list.innerHTML=`<div style="text-align:center;padding:60px 20px;color:var(--muted);font-family:'Space Mono',monospace;font-size:11px">
      Nenhuma carta tirada registrada ainda.<br>
      <span style="color:var(--accent)">Use "+ ADICIONAR" pra registrar as cartas boas que você tirou dos boosters.</span>
    </div>`;
    return;
  }
  const rows=pulledCards.map((c,i)=>({c,i})).reverse();
  list.innerHTML=`<div class="pulled-grid">`+rows.map(({c,i})=>{
    const rc=RARITY_COLOR[c.rar]||'#9086b0';
    return`<div class="pc" onclick="openCardModalByIdx(${i})">
      <div class="pc-icon" style="background:${rc}22">${c.icon||'🃏'}</div>
      <div class="pc-info"><div class="pc-name">${c.name}</div>
        <div class="pc-meta">${c.num||''}${c.lote?' · '+c.lote:''}</div></div>
      <div class="pc-right"><span class="rb" style="background:${rc}22;color:${rc};border-color:${rc}">${c.rar||''}</span>
        ${c.price?`<div class="pc-price">R$${fmtR(c.price)}</div>`:''}</div>
    </div>`;
  }).join('')+`</div>`;
}
async function addCard(){
  if(!uid())return;
  const nome=document.getElementById('c-nome').value.trim();
  const num=document.getElementById('c-num').value.trim();
  const rar=document.getElementById('c-rar').value;
  const src=document.getElementById('c-src').value.trim();
  const lote=document.getElementById('c-lote').value.trim();
  const price=parseFloat(document.getElementById('c-val').value)||0;
  if(!nome)return;
  const{data:res,error}=await sbClient.from('lorcana_pulled_cards').insert(
    {name:nome,num,rar,src,lote,icon:RARITY_ICON[rar]||'🃏',price,psrc:'Manual',user_id:uid()}).select();
  if(error){alert('Erro ao salvar carta: '+error.message);return;}
  if(Array.isArray(res))pulledCards.push(...res);
  closeModal('mc');renderCartas();renderDash();
}
function openCardModalByIdx(i){
  const card=pulledCards[i];
  if(!card)return;
  document.getElementById('card-modal-content').innerHTML=`
    <div style="padding:24px">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:1px">${card.name}</div>
      <div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:16px">${card.num||''} · ${card.rar||''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px">
        <div><label style="display:block;font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">Origem</label>${card.src||'—'}</div>
        <div><label style="display:block;font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">Lote</label>${card.lote||'—'}</div>
        <div><label style="display:block;font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">Valor</label><span style="color:var(--teal)">${card.price?'R$'+fmtR(card.price):'—'}</span></div>
        <div><label style="display:block;font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">Fonte</label>${card.psrc||'—'}</div>
      </div>
    </div>`;
  openModal('card-modal');
}

// ── PREÇO JUSTO (EV) ────────────────────────────────────────────
// Taxas de pull ESTIMADAS PELA COMUNIDADE (não são oficiais/garantidas pela
// Ravensburger) — fontes: cardgamer.com/games/tcgs/lorcana, tcgtalk.com
// (Wilds Unknown pull rates, 192 packs abertos), thegamerslodge.com.
// Cada booster tem 12 cartas: 6 comuns, 3 incomuns, 2 raras-ou-melhor +
// 1 slot foil garantido (é onde mora o Enchanted).
// O valor médio por raridade vem PRÉ-PREENCHIDO com a média real de preço
// (Lorcast, convertido pro câmbio atual) das cartas daquela raridade no
// capítulo selecionado — mas continua editável, porque preço de mercado
// muda mais rápido que o catálogo. Ver [[project_lorcana_expansion]].
const LORCANA_PULL_RATES={
  Rare:        {prob:1.35, label:'Rare (2 slots garantidos/pack, a maioria)'},
  'Super Rare':{prob:0.5,  label:'Super Rare (~1 a cada 2 packs)'},
  Legendary:   {prob:0.18, label:'Legendary (~1 a cada 5–6 packs)'},
  Enchanted:   {prob:0.012,label:'Enchanted (~1 a cada 72–96 packs)'},
};
let _evInputs={};
let _evSetId=null;

// Média real de preço (BRL) por raridade, calculada a partir do catálogo do capítulo.
function computeAvgPricesForSet(setId){
  const sums={},counts={};
  setCards(setId).forEach(raw=>{
    if(raw.Price==null||!LORCANA_PULL_RATES[raw.Rarity])return;
    sums[raw.Rarity]=(sums[raw.Rarity]||0)+raw.Price;
    counts[raw.Rarity]=(counts[raw.Rarity]||0)+1;
  });
  const avg={};
  Object.keys(LORCANA_PULL_RATES).forEach(r=>{
    if(counts[r])avg[r]=priceBRL(sums[r]/counts[r]);
  });
  return avg;
}

function renderPreco(){
  const wrap=document.getElementById('ev-wrap');
  if(!wrap)return;
  const availableSets=LORCANA_META.filter(m=>setCards(m.id).length>0);
  if(!_evSetId&&availableSets.length)_evSetId=availableSets[0].id;
  if(Object.keys(_evInputs).filter(k=>k!=='cost').length===0&&_evSetId){
    _evInputs={...computeAvgPricesForSet(_evSetId),cost:_evInputs.cost};
  }
  const setOpts=availableSets.map(m=>`<option value="${m.id}" ${m.id===_evSetId?'selected':''}>${m.code} — ${m.label}</option>`).join('');
  wrap.innerHTML=`
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-t">💰 Como funciona</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.7">
        Os valores por raridade abaixo já vêm pré-preenchidos com a média real de mercado (via Lorcast,
        convertida pro câmbio atual) das cartas daquele capítulo — mas edite à vontade se quiser testar outro
        cenário. As taxas de pull (chance de cada raridade sair por booster) são estimativas da comunidade,
        não são garantidas pela Ravensburger.
      </div>
    </div>
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-t">🎴 Capítulo</div>
      <select id="ev-set" onchange="_evSetId=parseInt(this.value);_evInputs={...computeAvgPricesForSet(_evSetId),cost:_evInputs.cost};renderPrecoInputs();updateEvSetInfo();recalcEV()" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:9px 12px;font-size:13px;margin-top:6px">${setOpts}</select>
      <div id="ev-set-info" style="margin-top:10px"></div>
    </div>
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-t">💵 Custo do Booster (R$)</div>
      <input class="ev-input" style="width:160px" type="number" step="0.01" id="ev-cost" value="${_evInputs.cost||''}" placeholder="0,00" oninput="_evInputs.cost=this.value;recalcEV()">
    </div>
    <div class="panel" style="margin-bottom:20px">
      <div class="panel-t">📈 Valor médio de mercado por raridade (R$) <span style="font-weight:400;color:var(--muted);font-size:10px">— pré-preenchido, editável</span></div>
      <div id="ev-rarity-inputs"></div>
    </div>
    <div class="panel" id="ev-result"></div>
  `;
  renderPrecoInputs();
  updateEvSetInfo();
  recalcEV();
}
function renderPrecoInputs(){
  const rarWrap=document.getElementById('ev-rarity-inputs');
  if(!rarWrap)return;
  rarWrap.innerHTML=Object.entries(LORCANA_PULL_RATES).map(([r,info])=>`
    <div class="ev-row">
      <span>${info.label}</span>
      <input class="ev-input" type="number" step="0.01" value="${_evInputs[r]??''}" placeholder="0,00" oninput="_evInputs['${r}']=this.value;recalcEV()">
    </div>`).join('');
}
function updateEvSetInfo(){
  const el=document.getElementById('ev-set-info');
  if(!el||!_evSetId)return;
  const cards=setCards(_evSetId);
  const counts={};
  cards.forEach(c=>{counts[c.Rarity]=(counts[c.Rarity]||0)+1;});
  const order=['Common','Uncommon','Rare','Super Rare','Legendary','Enchanted'];
  el.innerHTML=order.filter(r=>counts[r]).map(r=>
    `<span style="margin-right:16px;font-family:'Space Mono',monospace;font-size:10px;color:${RARITY_COLOR[r]||'var(--muted)'}">${r}: ${counts[r]}</span>`
  ).join('');
}
function recalcEV(){
  const res=document.getElementById('ev-result');
  if(!res)return;
  const cost=parseFloat(_evInputs.cost)||0;
  let evAvg=0;
  const rows=Object.entries(LORCANA_PULL_RATES).map(([r,info])=>{
    const price=parseFloat(_evInputs[r])||0;
    const ev=info.prob*price;
    evAvg+=ev;
    return`<div class="ev-row"><span>${info.label}</span><span style="font-family:'Space Mono',monospace">R$${fmtR(ev)}</span></div>`;
  }).join('');
  const net=evAvg-cost;
  res.innerHTML=`
    <div class="panel-t">🎯 Resultado</div>
    ${rows}
    <div class="ev-row" style="border-top:1px solid var(--border2);margin-top:8px;padding-top:12px">
      <span style="font-weight:700">EV médio por booster</span>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--gold)">R$${fmtR(evAvg)}</span>
    </div>
    <div class="ev-row">
      <span style="font-weight:700">Resultado esperado (EV − custo)</span>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:${net>=0?'var(--teal)':'var(--accent2)'}">${net>=0?'+':''}R$${fmtR(net)}</span>
    </div>`;
}
