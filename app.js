// ================================================================
// Pokémon TCG Dashboard — app.js v4 (multi-user + Google Auth)
// ================================================================
const SUPABASE_URL='https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SUPABASE_KEY='sb_publishable_f4d1JHAzTWPWYAI0Vm6aRA_NwM-uzr3';

// Supabase JS client (CDN carregado antes deste script em index.html)
if(!window.supabase){
  console.error('❌ Supabase CDN não carregou — verifique conexão ou bloqueador de scripts');
}
const sbClient=window.supabase ? window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY) : null;
let currentUser=null;

// ── AUTH ────────────────────────────────────────────────────────
function uid(){return currentUser?.id||null;}

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

// Escuta mudanças de sessão (login/logout/refresh)
sbClient.auth.onAuthStateChange((_event,session)=>{
  currentUser=session?.user??null;
  _updateUserChip(currentUser);
  if(currentUser){
    _showAuth(false);
    // Só carrega dados se o DOM estiver pronto
    if(document.readyState==='complete'||document.readyState==='interactive'){
      loadAll();
    }else{
      document.addEventListener('DOMContentLoaded',()=>loadAll());
    }
  }else{
    _showAuth(true);
  }
});

// ── IMAGENS ──────────────────────────────────────────────────────
function imgMe04(n){return`https://images.scrydex.com/pokemon/me4-${parseInt(n)}/large`;}
function imgMe03(n){return`https://images.scrydex.com/pokemon/me3-${parseInt(n)}/large`;}
function imgMe02(n){return`https://images.scrydex.com/pokemon/me2-${parseInt(n)}/large`;}
function imgMe05(n){return`https://images.scrydex.com/pokemon/me5-${parseInt(n)}/large`;}
function imgMe06(n){return`https://images.scrydex.com/pokemon/me6-${parseInt(n)}/large`;}
function imgMeg(n) {return`https://images.scrydex.com/pokemon/me1-${parseInt(n)}/large`;}
function imgMep(n) {
  const num=parseInt(n);
  return`https://images.scrydex.com/pokemon/mep-${num}/large`;
}

function getPurchaseImg(product){
  const p=product.toLowerCase();
  if(p.includes('me06')||p.includes('esmeralda')||p.includes('storm'))  return imgMe06(1);
  if(p.includes('me05')||p.includes('negrura')||p.includes('pitch'))    return imgMe05(61);
  if(p.includes('me04')||p.includes('caos')||p.includes('chaos'))       return p.includes('quádr')||p.includes('quadr')?imgMe04(15):imgMe04(22);
  if(p.includes('me03')||p.includes('ordem')||p.includes('perfect'))    return imgMe03(63);
  if(p.includes('me02')||p.includes('fogo')||p.includes('phantasmal'))  return imgMe02(13);
  if((p.includes('meg')||p.includes('me01'))&&!p.includes('me04'))      return imgMeg(3);
  if(p.includes('parceiros')||p.includes('partner')||p.includes('mep')) return imgMep(38);
  return imgMe04(22);
}

function getCardImg(card){
  const num=(card.num||'').match(/(\d+)/);
  if(!num) return null;
  const n=num[1];const lote=(card.lote||'').toLowerCase();const ns=card.num||'';
  if(lote.includes('me06')||lote.includes('esmeralda')||lote.includes('storm'))  return imgMe06(n);
  if(lote.includes('me05')||lote.includes('negrura')||lote.includes('pitch'))    return imgMe05(n);
  if(lote.includes('me03')||lote.includes('ordem')||lote.includes('perfect'))    return imgMe03(n);
  if(lote.includes('me02')||lote.includes('phantasmal')||lote.includes('fogo'))  return imgMe02(n);
  if(lote.includes('meg')||lote.includes('me01')||ns.includes('/132'))           return imgMeg(n);
  if(lote.includes('mep')||lote.includes('parceiros')||lote.includes('partner')) return imgMep(n);
  if(lote.includes('me04')||lote.includes('caos')||lote.includes('chaos'))       return imgMe04(n);
  return imgMe04(Math.min(parseInt(n)||1,122));
}

function getBinderImg(c,setId){
  const n=parseInt(c.n);
  if(setId==='me06') return imgMe06(n);
  if(setId==='me05') return imgMe05(n);
  if(setId==='me03') return imgMe03(n);
  if(setId==='me02') return imgMe02(n);
  if(setId==='meg')  return imgMeg(n);
  if(setId==='mep')  return imgMep(n);
  return imgMe04(n);
}

// ── CÂMBIO ──────────────────────────────────────────────────────
let USD_BRL=5.70;
async function fetchCambio(){
  try{const r=await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL');const d=await r.json();
    USD_BRL=d.rates.BRL;const el=document.getElementById('usd-brl');if(el)el.textContent=`USD/BRL R$${USD_BRL.toFixed(2)}`;}catch(e){}
}

// ── ESTADO ──────────────────────────────────────────────────────
let purchases=[],pulledCards=[],collected=new Set();

// ── VERSÕES ──────────────────────────────────────────────────────
const VER_COLOR={N:'#c8cfe8',F:'#118ab2',RH:'#06d6a0',SP:'#ff6b35'};
const VER_LABEL={N:'Normal',F:'Foil',RH:'Reverse Holo',SP:'Especial'};
const VER_SHORT={N:'N',F:'F',RH:'RH',SP:'★'};

function getSlots(c,setId){
  const r=c.rare||'';
  if(!c.base) return [{ver:'SP',price:c.price}];
  if(r.includes('Dupla')||r.includes('RR')) return [{ver:'F',price:c.price}];
  if(r==='Rara'||r.startsWith('Rara ')&&!r.includes('Ultra')) return [
    {ver:'N',price:c.price},
    {ver:'F',price:c.priceF||(c.price?+(c.price*1.5).toFixed(2):null)},
    {ver:'RH',price:c.priceRH||(c.price?+(c.price*1.2).toFixed(2):null)}
  ];
  // MEP: só tem IR (SP)
  if(setId==='mep') return [{ver:'SP',price:c.price}];
  return [{ver:'N',price:c.price},{ver:'RH',price:c.priceRH||(c.price?+(c.price*1.2).toFixed(2):null)}];
}

function slotKey(pfx,n,ver){return`${pfx}${n}:${ver}`;}
function getVerFromRar(rar){
  if(rar.includes('SAR')||rar.includes('UR')||rar.includes('IR')||rar.includes('Promo')) return 'SP';
  if(rar.includes('RR')||rar.includes('Dupla')||(rar.includes('Holo')&&rar.includes('Rara')&&!rar.includes('RH'))) return 'F';
  if(rar.includes('RH')||rar.includes('Reverse')) return 'RH';
  return 'N';
}

// ── CARREGAR ──────────────────────────────────────────────────────
async function loadAll(){
  setStatus('Conectando...','warning');
  if(!uid()){setStatus('Faça login','warning');return;}
  try{
    const myUid=uid();
    const[{data:p},{data:c},{data:col}]=await Promise.all([
      sbClient.from('purchases').select('*').eq('user_id',myUid).order('date',{ascending:false}),
      sbClient.from('pulled_cards').select('*').eq('user_id',myUid).order('id',{ascending:true}),
      sbClient.from('collection').select('slot_key').eq('user_id',myUid)
    ]);
    purchases=Array.isArray(p)?p:[];
    pulledCards=Array.isArray(c)?c:[];
    collected=new Set((Array.isArray(col)?col:[]).map(r=>r.slot_key));
    setStatus('Online ✓','ok');
    renderAll();updateHomeStats();
    loadCustomBinders();
    if(typeof initFichario==='function')initFichario();
  }catch(e){setStatus('Erro de conexão','error');console.error(e);}
}
function setStatus(txt,state){
  const el=document.getElementById('status-txt');if(el)el.textContent=txt;
  const dot=document.getElementById('status-dot');if(dot)dot.className=`dot dot-${state}`;
}

// ── TOGGLE SLOT ──────────────────────────────────────────────────
async function toggleSlot(key){
  if(!uid()) return;
  if(collected.has(key)){
    collected.delete(key);
    await sbClient.from('collection').delete().eq('slot_key',key).eq('user_id',uid());
  }else{
    collected.add(key);
    await sbClient.from('collection').upsert({slot_key:key,user_id:uid()},{onConflict:'user_id,slot_key'});
  }
  renderBinder();updateDashProgress();
}

// ── PÁGINAS / ABAS ───────────────────────────────────────────────
function goPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id==='home'?'pg-home':'pg-app').classList.add('active');
  if(id==='app') window.scrollTo(0,0);
}
function go(id,el){
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');el.classList.add('active');
  if(id==='fichario'){
    // Restaura controles se estava em fichário personalizado
    const bctl=document.querySelector('.bctl');if(bctl)bctl.style.display='';
    const binderCtrl=document.getElementById('fic-binder-controls');
    const setInfo=document.getElementById('fic-set-info');
    const bstats=document.getElementById('binder-stats');
    if(binderCtrl)binderCtrl.style.display='';
    if(setInfo)setInfo.style.display='';
    if(bstats)bstats.style.display='';
    if(currentSet==='__custom__') renderCustomBindersHome();
    else renderBinder();
  }
  if(id==='dash') updateDashProgress();
}
function renderAll(){renderDash();renderGastos();renderCartas();updateDashProgress();}

// ── UTILS ────────────────────────────────────────────────────────
const fmtR=v=>(+v||0).toFixed(2).replace('.',',');
const kpiHTML=(cls,lbl,val,sub)=>`<div class="kpi ${cls}"><div class="kpi-label">${lbl}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div></div>`;
const barHTML=(lbl,v,max,color,txt,dot='')=>{const w=max>0?Math.round(v/max*100):0;
  return`<div class="brow"><div class="blbl">${dot}${lbl}</div><div class="btrack"><div class="bfill" style="width:${w}%;background:${color}">${txt}</div></div></div>`;};
function safeJSON(obj){return JSON.stringify(obj).replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// ── HOME STATS ───────────────────────────────────────────────────
function updateHomeStats(){
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const el=document.getElementById('home-stats');
  if(el) el.textContent=`R$${fmtR(invested)} investidos · ${pulledCards.length} cartas tiradas · R$${fmtR(pull)} em valor`;
}

// ── PARTÍCULAS ───────────────────────────────────────────────────
function initParticles(){
  const c=document.getElementById('particles');if(!c)return;
  const colors=['#e63946','#118ab2','#06d6a0','#ffd166','#9C27B0'];
  for(let i=0;i<35;i++){
    const p=document.createElement('div');p.className='particle';
    const sz=1+Math.random()*2.5;
    p.style.cssText=`left:${Math.random()*100}%;width:${sz}px;height:${sz}px;`+
      `animation-duration:${8+Math.random()*14}s;animation-delay:${-Math.random()*22}s;`+
      `background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>.5?'50%':'2px'}`;
    c.appendChild(p);
  }
}

// ── 3D CARDS HOME ────────────────────────────────────────────────
function init3DCards(){
  document.querySelectorAll('.hset-wrap').forEach(wrap=>{
    wrap.addEventListener('mousemove',e=>{
      const rect=wrap.getBoundingClientRect();
      const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      const dx=(e.clientX-cx)/rect.width*2;
      const dy=(e.clientY-cy)/rect.height*2;
      const rotX=-dy*18,rotY=dx*18;
      wrap.style.transform=`perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.06)`;
    });
    wrap.addEventListener('mouseleave',()=>{
      wrap.style.transform='perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
      wrap.style.transition='transform .5s ease';
    });
    wrap.addEventListener('mouseenter',()=>{wrap.style.transition='transform .1s ease';});
  });
}

// ── DASHBOARD ────────────────────────────────────────────────────
function renderDash(){
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const bst=purchases.filter(p=>!p.acessorio);
  const tb=bst.reduce((s,p)=>s+p.boost,0),tg=bst.reduce((s,p)=>s+Number(p.price),0);
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const roi=invested>0?(pull/invested*100).toFixed(0):0;
  const apb=tb>0?(tg/tb).toFixed(2):'0,00';
  document.getElementById('kpi-dash').innerHTML=
    kpiHTML('red','💰 Total Investido','R$'+fmtR(invested),purchases.length+' compras')+
    kpiHTML('orange','📦 Boosters',''+tb,'~'+(tb*6)+' cartas')+
    kpiHTML('gold','💵 R$/Booster','R$'+apb.replace('.',','),'média ponderada')+
    kpiHTML('teal','💎 Valor Pull','R$'+fmtR(pull),pulledCards.length+' cartas')+
    kpiHTML('blue','📊 Retorno',roi+'%','valor tirado ÷ gasto');

  // Gráfico raridades com dot colorido
  const rCount={},rVer={};
  pulledCards.forEach(c=>{
    const raw=c.rar||'';let k='Outro',ver='N';
    if(raw.includes('SAR')){k='SAR';ver='SP';}
    else if(raw.includes('RR')||raw.includes('Dupla')){k='Dupla Rara';ver='F';}
    else if(raw.includes('UR')){k='Rara Ultra';ver='SP';}
    else if(raw.includes('IR')||raw.includes('Ilustr')){k='Ilustr. Rara';ver='SP';}
    else if(raw.includes('Promo')){k='Promo';ver='SP';}
    else if(raw.includes('Holo')&&raw.includes('Rara')&&!raw.includes('RH')){k='Rara Holo';ver='F';}
    else if(raw.includes('RH')){k='Reverse Holo';ver='RH';}
    rCount[k]=(rCount[k]||0)+1;rVer[k]=ver;
  });
  const rMax=Math.max(...Object.values(rCount),1);
  document.getElementById('chart-rarity').innerHTML=Object.entries(rCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
    const ver=rVer[k]||'N';const col=VER_COLOR[ver];
    const dot=`<div style="width:9px;height:9px;border-radius:2px;background:${col};flex-shrink:0"></div>`;
    return barHTML(k,v,rMax,col,''+v,dot);
  }).join('')||'<div style="color:var(--muted);font-size:12px;padding:8px">Sem cartas ainda</div>';

  // Gráfico gastos
  const byDate={};purchases.forEach(p=>{byDate[p.date]=(byDate[p.date]||0)+Number(p.price);});
  const dMax=Math.max(...Object.values(byDate),1);
  document.getElementById('chart-gastos').innerHTML=Object.entries(byDate).sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([d,v])=>barHTML(d.slice(5),v,dMax,'linear-gradient(90deg,var(--accent),var(--accent2))','R$'+fmtR(v))).join('');

  // Highlights top 6
  const rl={'Dupla Rara (RR)':'RR','Ilustração Rara (SAR)':'SAR','Ilustracao Rara (SAR)':'SAR',
    'Ilustração Rara (IR)':'IR','Ilustracao Rara (IR)':'IR','Rara Ultra (UR)':'UR',
    'Rara (Holo)':'HOLO','Incomum (RH)':'RH','Comum (RH)':'RH','Promocional':'PROMO'};
  const top=[...pulledCards].sort((a,b)=>(b.price||0)-(a.price||0)).slice(0,6);
  document.getElementById('dash-highlights').innerHTML=top.map(c=>{
    const imgSrc=getCardImg(c);const ver=getVerFromRar(c.rar||'');
    return`<div class="pc" onclick='openCardModal(${safeJSON(c)})'>
      ${imgSrc?`<img class="pc-img" src="${imgSrc}" alt="${c.name}" onerror="this.style.display='none'">`:
        `<div class="pc-icon ${c.ic||'fp'}">${c.icon||'🃏'}</div>`}
      <div class="pc-info"><div class="pc-name">${c.name}</div><div class="pc-meta">${c.num||''}</div>
        <div class="pc-src">${c.lote||''}</div>
        <div class="ver-dots"><div class="ver-dot" style="background:${VER_COLOR[ver]};border-color:${VER_COLOR[ver]}" title="${VER_LABEL[ver]}"></div></div></div>
      <div class="pc-right"><span class="rb ${c.bc||'bx'}">${rl[c.rar]||c.rar?.split(' ')[0]||''}</span>
        ${c.price?`<div class="pc-price">R$${fmtR(c.price)}</div>`:''}</div>
    </div>`;
  }).join('');
}

// ── PROGRESS ────────────────────────────────────────────────────
const SET_META={
  me06:{label:'💎 ME06 — Esmeralda Tempestuosa',color:'#00c853',chase:'Mega Rayquaza ex Gold — R$1.500 (est.)',heroCard:1,imgFn:imgMe06,upcoming:true,releaseDate:'out/2026'},
  me05:{label:'🌑 ME05 — Pitch Black',color:'#424242',chase:'Mega Darkrai ex Gold — R$1.200 (est.)',heroCard:61,imgFn:imgMe05,upcoming:true,releaseDate:'ago/2026'},
  me04:{label:'🔥 ME04 — Caos Ascendente',color:'var(--accent)',chase:'Mega Greninja ex Gold — R$1.482',heroCard:22,imgFn:imgMe04},
  me03:{label:'🔵 ME03 — Ordem Perfeita',color:'#1565C0',chase:'Meowth ex SAR — R$870 · Mega Zygarde ex Gold — R$775',heroCard:62,imgFn:imgMe03},
  me02:{label:'👻 ME02 — Fogo Fantasmagórico',color:'#9C27B0',chase:'Mega Charizard X ex SAR — R$1.809',heroCard:13,imgFn:imgMe02},
  meg: {label:'🌿 MEG — Megaevolução',color:'#4CAF50',chase:'Mega Greninja ex UR — R$60',heroCard:3,imgFn:imgMeg},
  mep: {label:'⭐ MEP — Parceiros Iniciais',color:'#ffd166',chase:'Charmander MEP038 — R$36',heroCard:38,imgFn:imgMep},
};
const ALL_SETS={
  me06:()=>typeof CARDS_ME06!=='undefined'?CARDS_ME06:[],
  me05:()=>typeof CARDS_ME05!=='undefined'?CARDS_ME05:[],
  me04:()=>CARDS,
  me03:()=>typeof CARDS_ME03!=='undefined'?CARDS_ME03:[],
  me02:()=>CARDS_ME02,
  meg:()=>CARDS_MEG,
  mep:()=>CARDS_MEP
};

function countSlotsFor(cards,pfx){
  let total=0,col=0;
  cards.forEach(c=>{getSlots(c,pfx).forEach(s=>{total++;if(collected.has(slotKey(pfx+':',c.n,s.ver)))col++;});});
  return{total,col};
}
function updateDashProgress(){
  let grand=0,grandC=0;
  const html=Object.entries(SET_META).map(([id,meta])=>{
    const cards=ALL_SETS[id]();
    const base=countSlotsFor(cards.filter(c=>c.base),id);
    const sec=countSlotsFor(cards.filter(c=>!c.base),id);
    const tot=base.total+sec.total,col=base.col+sec.col;
    grand+=tot;grandC+=col;const pct=tot>0?(col/tot*100).toFixed(0):0;
    const upcomingBadge=meta.upcoming?`<div style="position:absolute;top:10px;right:10px;background:#f0932b;color:#fff;font-size:9px;letter-spacing:1px;padding:2px 8px;border-radius:4px;font-family:'Space Mono',monospace">EM BREVE ${meta.releaseDate||''}</div>`:'';
    return`<div class="panel" style="border-color:${meta.color}44;overflow:hidden;position:relative;${meta.upcoming?'opacity:.8':''}">
      ${upcomingBadge}
      <div style="position:absolute;right:-8px;top:-8px;width:70px;height:100px;opacity:.1;pointer-events:none">
        <img src="${meta.imgFn(meta.heroCard)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="flex:1"><div style="font-weight:700;font-size:13px">${meta.label}</div>
        <div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">${meta.upcoming?'Lancamento previsto: '+(meta.releaseDate||'em breve'):(tot+' slots · master set')}</div></div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:30px;color:${meta.color};line-height:1">${meta.upcoming?'?':pct+'%'}</div>
      </div>
      ${!meta.upcoming?`<div class="prog"><div class="prog-lbl"><span>Base</span><span>${base.col}/${base.total}</span></div>
        <div class="prog-t"><div class="prog-f" style="width:${base.total>0?(base.col/base.total*100).toFixed(1):0}%;background:${meta.color}"></div></div></div>
      ${sec.total>0?`<div class="prog" style="margin:0"><div class="prog-lbl"><span>Secretas</span><span>${sec.col}/${sec.total}</span></div>
        <div class="prog-t"><div class="prog-f" style="width:${sec.total>0?(sec.col/sec.total*100).toFixed(1):0}%;background:${meta.color}88"></div></div></div>`:''}`:''}
      <div style="margin-top:10px;font-size:10px;font-family:'Space Mono',monospace;color:var(--muted)">Chase: <span style="color:${meta.color}">${meta.chase}</span></div>
    </div>`;
  }).join('');
  document.getElementById('progress-sets').innerHTML=html;
  const pct=grand>0?(grandC/grand*100).toFixed(1):0;
  const allCards=Object.values(ALL_SETS).flatMap(fn=>fn());
  const imp=allCards.filter(c=>c.important).length;
  document.getElementById('binder-stats').innerHTML=`
    <div><div class="bsv" style="color:var(--teal)">${grandC}</div><div class="bsl">Slots Coletados</div></div>
    <div><div class="bsv" style="color:var(--gold)">${imp}</div><div class="bsl">Importantes</div></div>
    <div><div class="bsv" style="color:var(--muted)">${grand}</div><div class="bsl">Total Slots</div></div>
    <div style="flex:1;min-width:180px">
      <div style="height:6px;background:var(--surface2);border-radius:3px;margin-bottom:5px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:3px"></div></div>
      <div class="bsl"><span style="color:var(--teal)">${pct}%</span> MASTER SET COMPLETO</div>
    </div>`;
}

// ── GASTOS ──────────────────────────────────────────────────────
function renderGastos(){
  const total=purchases.reduce((s,p)=>s+Number(p.price),0);
  const bst=purchases.filter(p=>!p.acessorio);
  const tb=bst.reduce((s,p)=>s+p.boost,0),tc=bst.reduce((s,p)=>s+p.cards,0),tg=bst.reduce((s,p)=>s+Number(p.price),0);
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const roi=total>0?(pull/total*100).toFixed(0):0;
  const apb=tb>0?(tg/tb).toFixed(2):'0,00',apc=tc>0?(tg/tc).toFixed(2):'0,00';
  document.getElementById('gastos-resumo').innerHTML=`<div class="kpi-grid">
    ${kpiHTML('red','💰 Total Investido','R$'+fmtR(total),purchases.length+' compras · '+tb+' boosters')}
    ${kpiHTML('gold','📦 R$/Booster','R$'+apb.replace('.',','),'média ponderada')}
    ${kpiHTML('orange','🃏 R$/Carta','R$'+apc.replace('.',','),'~'+tc+' cartas')}
    ${kpiHTML('teal','💎 Valor Tirado','R$'+fmtR(pull),pulledCards.length+' cartas')}
    ${kpiHTML('blue','📊 Retorno',roi+'%',pull>=total?'✅ acima do gasto':'📉 abaixo do gasto')}
  </div>`;

  document.getElementById('gastos-cards').innerHTML=purchases.map(p=>{
    const pb=p.boost>0?(Number(p.price)/p.boost).toFixed(2):null;
    const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
    const imgSrc=getPurchaseImg(p.product);
    return`<div class="pcard">
      <div class="pcard-img-wrap">
        <img src="${imgSrc}" alt="${p.product}" onerror="this.style.display='none'">
        <div class="pcard-img-overlay"></div>
        <div class="pcard-img-label">${p.tipo}</div>
      </div>
      <div class="pcard-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span class="pill pt">${p.tipo}</span>
              <span style="font-size:11px;color:var(--muted);font-family:'Space Mono',monospace">${d}</span>
              ${p.acessorio?'<span style="font-family:\'Space Mono\',monospace;font-size:9px;color:var(--muted);background:rgba(107,117,153,.15);padding:2px 7px;border-radius:10px">ACESSÓRIO</span>':''}
            </div>
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p.product}</div>
            ${p.boost>0?`<div style="font-size:11px;color:var(--muted)">${p.boost} boosters · ~${p.cards} cartas</div>`:''}
          </div>
          <div style="display:flex;gap:16px;align-items:center">
            <div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--accent);line-height:1">R$${fmtR(p.price)}</div>
              <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">PAGO</div></div>
            ${pb?`<div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--gold);line-height:1">R$${pb.replace('.',',')}</div>
              <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">POR BOOSTER</div></div>`:''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('tlwrap').innerHTML=[...purchases].reverse().map(p=>{
    const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
    const pb=p.boost>0?(Number(p.price)/p.boost).toFixed(2):null;
    return`<div class="tli"><div class="tl-date">${d}</div><div class="tl-desc">${p.product}</div>
      <div class="tl-amt">R$${fmtR(p.price)}${pb?` · <span style="color:var(--gold)">R$${pb.replace('.',',')}/booster</span>`:''}</div></div>`;
  }).join('');
}

// ── CARTAS TIRADAS ───────────────────────────────────────────────
function renderCartas(){
  const total=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const roi=invested>0?(total/invested*100).toFixed(0):0;
  document.getElementById('cards-hdr').innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:22px">
    ${kpiHTML('teal','💎 Valor Pull','R$'+fmtR(total),pulledCards.length+' cartas')}
    ${kpiHTML('gold','📊 % Investimento',roi+'%','de R$'+fmtR(invested))}
    ${kpiHTML('red','🛍️ Investido','R$'+fmtR(invested),purchases.length+' compras')}
    ${kpiHTML('blue','📚 Sets','7','ME04·ME03·ME02·MEG·MEP + ME05·ME06')}
  </div>`;
  const rl={'Dupla Rara (RR)':'RR','Ilustração Rara (SAR)':'SAR','Ilustracao Rara (SAR)':'SAR',
    'Ilustração Rara (IR)':'IR','Ilustracao Rara (IR)':'IR','Rara Ultra (UR)':'UR',
    'Rara (Holo)':'HOLO','Incomum (RH)':'RH','Comum (RH)':'RH','Promocional':'PROMO'};
  const lotes={};
  pulledCards.forEach(c=>{const l=c.lote||'Sem lote';if(!lotes[l])lotes[l]=[];lotes[l].push(c);});
  let html='';
  Object.entries(lotes).forEach(([lote,cards])=>{
    const lTotal=cards.reduce((s,c)=>s+Number(c.price||0),0);
    html+=`<div style="font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;padding:8px 0 6px;border-bottom:1px solid var(--border);margin-bottom:12px;display:flex;justify-content:space-between">
      <span>📦 ${lote}</span><span style="color:var(--teal)">${cards.length} · R$${fmtR(lTotal)}</span></div><div class="pulled-grid">`;
    cards.forEach(c=>{
      const imgSrc=getCardImg(c);const ver=getVerFromRar(c.rar||'');
      const mm=(c.pmin&&c.pmax)?`<div class="pc-minmax">mín <span style="color:var(--teal)">R$${fmtR(c.pmin)}</span> · máx <span style="color:var(--accent)">R$${fmtR(c.pmax)}</span></div>`:'';
      html+=`<div class="pc" onclick='openCardModal(${safeJSON(c)})'>
        ${imgSrc?`<img class="pc-img" src="${imgSrc}" alt="${c.name}" onerror="this.style.display='none'">`:
          `<div class="pc-icon ${c.ic||'fp'}">${c.icon||'🃏'}</div>`}
        <div class="pc-info"><div class="pc-name">${c.name}</div><div class="pc-meta">${c.num||''}</div>
          ${c.psrc?`<div class="pc-src">📊 ${c.psrc}</div>`:''}${mm}
          <div class="ver-dots"><div class="ver-dot" style="background:${VER_COLOR[ver]};border-color:${VER_COLOR[ver]}" title="${VER_LABEL[ver]}"></div></div></div>
        <div class="pc-right"><span class="rb ${c.bc||'bx'}">${rl[c.rar]||c.rar?.split(' ')[0]||''}</span>
          ${c.price?`<div class="pc-price">R$${fmtR(c.price)}</div>`:''}</div>
      </div>`;
    });
    html+='</div>';
  });
  document.getElementById('cards-list').innerHTML=html;
}

// ── MODAL CARTA TIRADA EXPANDIDA ─────────────────────────────────
function openCardModal(card){
  if(typeof card==='string') card=JSON.parse(card);
  const imgSrc=getCardImg(card);const ver=getVerFromRar(card.rar||'');
  document.getElementById('card-modal-content').innerHTML=`
    ${imgSrc?`<img class="cmc-img" src="${imgSrc}" alt="${card.name}" onerror="this.style.display='none'">`:
      `<div style="height:180px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:40px">${card.icon||'🃏'}</div>`}
    <div class="cmc-body">
      <div class="cmc-title">${card.name}</div>
      <div class="cmc-sub">${card.num||''} · ${card.rar||''}</div>
      <div class="cmc-grid">
        <div class="cmc-item"><label>Origem</label><span>${card.src||'—'}</span></div>
        <div class="cmc-item"><label>Lote</label><span>${(card.lote||'—').split('—').pop().trim()}</span></div>
        <div class="cmc-item"><label>Valor Médio</label><span style="color:var(--teal)">${card.price?'R$'+fmtR(card.price):'—'}</span></div>
        <div class="cmc-item"><label>Fonte</label><span>${card.psrc||'—'}</span></div>
        ${card.pmin&&card.pmax?`<div class="cmc-item"><label>Mínimo</label><span>R$${fmtR(card.pmin)}</span></div>
          <div class="cmc-item"><label>Máximo</label><span>R$${fmtR(card.pmax)}</span></div>`:''}
      </div>
      <div class="cmc-vers">
        <div class="cmc-dot" style="background:${VER_COLOR[ver]};border-radius:3px;width:12px;height:12px"></div>
        <span style="font-family:'Space Mono',monospace;font-size:10px">${VER_LABEL[ver]}</span>
      </div>
    </div>`;
  openModal('card-modal');
}

// ── FICHÁRIO ────────────────────────────────────────────────────
let currentSet='me04';
function switchSet(id,el){
  currentSet=id;
  document.querySelectorAll('.ctab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  if(id==='__custom__'){renderCustomBindersHome();return;}
  // Restore standard controls visibility
  const binderCtrl=document.getElementById('fic-binder-controls');
  const setInfo=document.getElementById('fic-set-info');
  const bstats=document.getElementById('binder-stats');
  if(binderCtrl)binderCtrl.style.display='';
  if(setInfo)setInfo.style.display='';
  if(bstats)bstats.style.display='';
  renderBinder();
}
function getSetData(){
  const me03c=typeof CARDS_ME03!=='undefined'?CARDS_ME03:[];
  const me05c=typeof CARDS_ME05!=='undefined'?CARDS_ME05:[];
  const me06c=typeof CARDS_ME06!=='undefined'?CARDS_ME06:[];
  const map={
    me06:{cards:me06c,imgFn:imgMe06,label:'ME06 — Esmeralda Tempestuosa',upcoming:true,
      sections:[{lbl:'📄 Base',filter:c=>c.base},{lbl:'✨ Secretas',filter:c=>!c.base}]},
    me05:{cards:me05c,imgFn:imgMe05,label:'ME05 — Negrura Absoluta',upcoming:false,
      sections:[{lbl:'📄 Base — 001 a 105',filter:c=>c.base},{lbl:'✨ Secretas',filter:c=>!c.base}]},
    me04:{cards:CARDS,imgFn:imgMe04,label:'ME04 — Caos Ascendente',
      sections:[{lbl:'📄 Base — 001 a 086',filter:c=>c.base},{lbl:'✨ Secretas — 087 a 122',filter:c=>!c.base}]},
    me03:{cards:me03c,imgFn:imgMe03,label:'ME03 — Ordem Perfeita',
      sections:[{lbl:'📄 Base — 001 a 070',filter:c=>c.base},{lbl:'✨ Secretas — 071 a 120',filter:c=>!c.base}]},
    me02:{cards:CARDS_ME02,imgFn:imgMe02,label:'ME02 — Fogo Fantasmagórico',
      sections:[{lbl:'📄 Base — 001 a 094',filter:c=>c.base},{lbl:'✨ Secretas — 095 a 130',filter:c=>!c.base}]},
    meg: {cards:CARDS_MEG,imgFn:imgMeg,label:'MEG — Megaevolução',
      sections:[{lbl:'📄 Base — 001 a 132',filter:c=>c.base},{lbl:'✨ Secretas — 133 a 188',filter:c=>!c.base}]},
    mep: {cards:CARDS_MEP,imgFn:imgMep,label:'MEP — Parceiros Iniciais (Promos)',
      sections:[{lbl:'⭐ Série 1 — Kanto, Sinnoh, Alola (MEP037–045)',filter:c=>c.base},{lbl:'📦 Outros Promos',filter:c=>!c.base}]},
  };
  return map[currentSet]||map.me04;
}

function renderBinder(){
  const{cards,imgFn,label,sections}=getSetData();
  const pfx=currentSet;
  const q=document.getElementById('bsrch').value.toLowerCase();
  const oc=document.getElementById('fc').checked,om=document.getElementById('fm').checked,oi=document.getElementById('fi2').checked;
  let totalSlots=0,colSlots=0;
  cards.forEach(c=>{getSlots(c,pfx).forEach(s=>{totalSlots++;if(collected.has(slotKey(pfx+':',c.n,s.ver)))colSlots++;});});
  const pct=totalSlots>0?(colSlots/totalSlots*100).toFixed(0):0;
  const totalBase=pfx==='me04'?86:pfx==='me02'?94:pfx==='meg'?132:cards.filter(c=>c.base).length;

  function cardVisible(c){
    const term=(c.name+c.n+(c.type||'')).toLowerCase();
    if(q&&!term.includes(q))return false;
    const anyCol=getSlots(c,pfx).some(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    if(oc&&!anyCol)return false;if(om&&anyCol)return false;if(oi&&!c.important)return false;
    return true;
  }

  function buildCard(c){
    if(!cardVisible(c))return'';
    const slots=getSlots(c,pfx);
    const allCol=slots.every(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    const anyCol=slots.some(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    const numLabel=`${c.n}/${String(totalBase).padStart(3,'0')}`;
    const imgSrc=getBinderImg(c,pfx);
    const versBoxes=slots.map(s=>{
      const key=slotKey(pfx+':',c.n,s.ver);const isCol=collected.has(key);const col=VER_COLOR[s.ver];
      const priceStr=s.price?`R$${fmtR(s.price)}`:'';
      return`<div class="vslot${isCol?' vslot-col':''}" onclick="event.stopPropagation();toggleSlot('${key}')" title="${VER_LABEL[s.ver]}${priceStr?' — '+priceStr:''}">
        <div class="vdot" style="background:${isCol?col:'transparent'};border-color:${col};color:${isCol?'#08090d':col}">${isCol?'✓':VER_SHORT[s.ver]}</div>
        <div class="vnum">${numLabel}</div>${priceStr?`<div class="vprice">${priceStr}</div>`:''}
      </div>`;
    }).join('');
    return`<div class="bc2${allCol?' collected':''}${anyCol&&!allCol?' bc2-partial':''}${c.important?' important':''}"
      title="${c.name}" onclick='openBinderModal(${safeJSON(c)},"${pfx}")'>
      <div class="bc2-in">
        <img src="${imgSrc}" alt="${c.name}" loading="lazy"
          style="filter:${allCol?'none':anyCol?'saturate(.6) brightness(.75)':'grayscale(80%) brightness(.55)'}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="fb"><div class="fb-n">${c.n}</div><div class="fb-name">${c.name}</div>
          <div class="fb-t">${c.type||''}</div><div class="fb-stripe" style="background:${c.color||'#666'}"></div></div>
        <div class="vslots">${versBoxes}</div>
      </div>
      <div class="chk">✓</div>
      <div class="tip"><div class="tip-n">${c.name}</div><div class="tip-nr">#${c.n} · ${c.type||''}</div>
        <div class="tip-r">${c.rare||''}</div>${c.price?`<div class="tip-p">R$${fmtR(c.price)}</div>`:''}
        ${c.important?'<div class="tip-imp">★ Importante</div>':''}</div>
    </div>`;
  }

  const setInfo=`<div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:14px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
    <span>${label}</span><span style="color:var(--teal)">${colSlots}/${totalSlots} slots</span>
    <span style="color:var(--gold)">${pct}% master set</span>
    <div style="flex:1;min-width:100px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:2px"></div></div>
    <span style="font-size:9px;color:var(--muted)">Clique na carta para marcar versões</span>
  </div>`;
  let html=setInfo;
  sections.forEach(s=>{
    const filtered=cards.filter(s.filter);
    const built=filtered.map(buildCard).join('');
    if(built.trim())html+=`<div class="bsec-lbl">${s.lbl}</div><div class="bgrid">${built}</div>`;
  });
  document.getElementById('bwrap').innerHTML=html;
  updateDashProgress();
}

// ── MODAL FICHÁRIO — marcar versão + origem da compra ────────────
function openBinderModal(card, setId){
  if(typeof card==='string') card=JSON.parse(card);
  const slots=getSlots(card,setId);
  const pfx=setId+':';
  const imgSrc=getBinderImg(card,setId);

  // Opções de versão
  const verHTML=slots.map(s=>{
    const key=slotKey(pfx,card.n,s.ver);
    const isCol=collected.has(key);
    const col=VER_COLOR[s.ver];
    return`<div class="ver-card${isCol?' active':''}" id="vcard-${s.ver}"
      onclick="toggleVerCard('${key}','${s.ver}')"
      style="${isCol?`border-color:${col};background:${col}18`:''}">
      <div class="ver-card-dot" style="background:${isCol?col:'transparent'};border-color:${col}"></div>
      <div class="ver-card-label" style="color:${isCol?col:'var(--text)'}">${VER_LABEL[s.ver]}</div>
      <div class="ver-card-price">${s.price?'R$'+fmtR(s.price):''}</div>
      ${isCol?`<div style="color:var(--teal);font-size:10px;margin-top:4px">✓ Coletada</div>`:''}
    </div>`;
  }).join('');

  // Lista de compras (mais recente primeiro)
  const purchaseOpts=purchases.map(p=>`<option value="${p.id}">${new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} — ${p.product.substring(0,45)}</option>`).join('');

  document.getElementById('mbinder-content').innerHTML=`
    ${imgSrc?`<img class="mbinder-img" src="${imgSrc}" alt="${card.name}" onerror="this.style.display='none'">`:
      `<div style="height:160px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:36px;border-radius:8px 8px 0 0">🃏</div>`}
    <div class="mbinder-body">
      <div class="mbinder-title">${card.name}</div>
      <div class="mbinder-sub">#${card.n} · ${card.type||''} · ${card.rare||''} ${card.price?'· R$'+fmtR(card.price):''}</div>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:10px">MARCAR VERSÕES COLETADAS</div>
      <div class="ver-select-grid" id="ver-grid-${card.n}">${verHTML}</div>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px;margin-top:14px">REGISTRAR CARTA TIRADA NESTA COMPRA</div>
      <select class="origin-select" id="origin-purchase">
        <option value="">— Não registrar como tirada —</option>
        ${purchaseOpts}
      </select>
      <div id="origin-ver-wrap" style="display:none;margin-top:8px">
        <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">VERSÃO TIRADA</div>
        <div style="display:flex;gap:8px;">
          ${slots.map(s=>`<div class="ver-card" id="pulled-ver-${s.ver}" onclick="selectPulledVer('${s.ver}')"
            style="flex:1;padding:8px">
            <div class="ver-card-dot" style="background:transparent;border-color:${VER_COLOR[s.ver]}"></div>
            <div class="ver-card-label">${VER_LABEL[s.ver]}</div>
          </div>`).join('')}
        </div>
      </div>
      <div class="mact">
        <button class="btn-cx" onclick="closeModal('mbinder')">Cancelar</button>
        <button class="btn-add" onclick='saveBinderModal(${safeJSON(card)},"${setId}")'>✓ Salvar</button>
      </div>
    </div>`;

  // Mostrar seleção de versão quando escolher uma compra
  document.getElementById('origin-purchase').onchange=function(){
    document.getElementById('origin-ver-wrap').style.display=this.value?'block':'none';
  };
  openModal('mbinder');
}

let _selectedPulledVer=null;
function selectPulledVer(ver){
  _selectedPulledVer=ver;
  document.querySelectorAll('[id^="pulled-ver-"]').forEach(el=>{
    const v=el.id.replace('pulled-ver-','');
    const col=VER_COLOR[v];
    el.style.borderColor=v===ver?col:'var(--border)';
    el.style.background=v===ver?col+'22':'';
    el.querySelector('.ver-card-dot').style.background=v===ver?col:'transparent';
  });
}

async function toggleVerCard(key,ver){
  if(!uid()) return;
  const isCol=collected.has(key);
  if(isCol){collected.delete(key);await sbClient.from('collection').delete().eq('slot_key',key).eq('user_id',uid());}
  else{collected.add(key);await sbClient.from('collection').upsert({slot_key:key,user_id:uid()},{onConflict:'user_id,slot_key'});}
  // Atualizar visual do card clicado
  const card=document.getElementById(`vcard-${ver}`);
  if(card){
    const col=VER_COLOR[ver];const nowCol=collected.has(key);
    card.style.borderColor=nowCol?col:'var(--border)';
    card.style.background=nowCol?col+'18':'';
    card.querySelector('.ver-card-dot').style.background=nowCol?col:'transparent';
    const lbl=card.querySelector('.ver-card-label');if(lbl)lbl.style.color=nowCol?col:'var(--text)';
    let status=card.querySelector('.ver-status');
    if(nowCol&&!status){const s=document.createElement('div');s.className='ver-status';s.style.cssText='color:var(--teal);font-size:10px;margin-top:4px';s.textContent='✓ Coletada';card.appendChild(s);}
    if(!nowCol&&status)status.remove();
  }
  updateDashProgress();
}

async function saveBinderModal(card,setId){
  // Verificar se quer registrar como tirada
  const purchaseId=document.getElementById('origin-purchase').value;
  if(purchaseId&&_selectedPulledVer){
    const purchase=purchases.find(p=>String(p.id)===String(purchaseId));
    const ver=_selectedPulledVer;
    const slots=getSlots(card,setId);
    const slot=slots.find(s=>s.ver===ver)||slots[0];
    const rMap={SP:'Ilustração Rara (IR)',F:'Rara (Holo)',RH:'Incomum (RH)',N:'Regular'};
    const icons={Grama:'🌿',Fogo:'🔥',Aquático:'💧',Raio:'⚡',Psíquico:'🔮',Lutador:'🥊',Escuridão:'⚫',Metal:'⚙️',Dragão:'🐉',Incolor:'⬜'};
    const row={
      name:card.name,
      num:`${card.n}/${String(setId==='me04'?86:setId==='me02'?94:setId==='meg'?132:card.n).padStart(3,'0')} — ${VER_LABEL[ver]}`,
      rar:card.rare||rMap[ver]||'Regular',
      src:purchase?purchase.product.substring(0,60):'Fichário',
      lote:`${purchase?new Date(purchase.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):''} — ${setId.toUpperCase()}`,
      icon:icons[card.type||'']||'🃏',
      ic:'fp',
      bc:ver==='SP'?'bi':ver==='F'?'br':'bx',
      price:slot.price||card.price||null,
      psrc:'Fichário — preço estimado'
    };
    if(!uid()) return;
    const {data:res}=await sbClient.from('pulled_cards').insert({...row,user_id:uid()}).select();
    if(Array.isArray(res))pulledCards.push(...res);
    renderCartas();renderDash();
  }
  closeModal('mbinder');
  _selectedPulledVer=null;
  renderBinder();
}

// ── ABERTURA DE BOOSTERS ─────────────────────────────────────────
let _boosterCards={}; // {cardN_setId: true}

function loadBoosterSlots(){
  const sel=document.getElementById('open-purchase');
  const pid=sel.value;
  const purchase=purchases.find(p=>String(p.id)===String(pid));
  if(!purchase){document.getElementById('open-slots').innerHTML='';return;}

  // Detectar qual set pela compra
  const prod=purchase.product.toLowerCase();
  let setId='me04',setCards=CARDS,setLabel='ME04 — Caos Ascendente';
  if(prod.includes('me02')||prod.includes('fogo')||prod.includes('phantasmal')){setId='me02';setCards=CARDS_ME02;setLabel='ME02';}
  else if((prod.includes('meg')||prod.includes('me01'))&&!prod.includes('me04')){setId='meg';setCards=CARDS_MEG;setLabel='MEG';}
  else if(prod.includes('parceiros')||prod.includes('partner')||prod.includes('mep')){setId='mep';setCards=CARDS_MEP;setLabel='MEP';}

  _boosterCards={};
  const boosters=purchase.boost||3;

  // Renderizar slots de boosters com lista de cartas
  let html=`<div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:1px;margin-bottom:12px">${setLabel} · ${boosters} booster${boosters!==1?'s':''}</div>`;

  for(let b=1;b<=boosters;b++){
    html+=`<div class="booster-slot">
      <div class="booster-slot-title">📦 Booster ${b}</div>
      <div id="booster-search-${b}" style="margin-bottom:8px">
        <input placeholder="Buscar carta para adicionar..." class="bsrch" style="max-width:100%"
          oninput="filterBoosterCards(this.value,${b},'${setId}')">
      </div>
      <div id="booster-cards-${b}" style="max-height:200px;overflow-y:auto"></div>
      <div id="booster-selected-${b}" style="margin-top:8px"></div>
    </div>`;
  }
  document.getElementById('open-slots').innerHTML=html;
  // Inicializar cada booster vazio
  for(let b=1;b<=boosters;b++) filterBoosterCards('',b,setId);
}

function filterBoosterCards(q,boosterN,setId){
  const setCards={me04:CARDS,me02:CARDS_ME02,meg:CARDS_MEG,mep:CARDS_MEP}[setId]||CARDS;
  const term=q.toLowerCase();
  const filtered=q.length>1?setCards.filter(c=>(c.name+c.n).toLowerCase().includes(term)).slice(0,8):[];
  const container=document.getElementById(`booster-cards-${boosterN}`);
  if(!container)return;
  if(!filtered.length){container.innerHTML=q.length>1?'<div style="color:var(--muted);font-size:11px;padding:6px">Nenhuma carta encontrada</div>':'';return;}
  container.innerHTML=filtered.map(c=>{
    const imgSrc=getBinderImg(c,setId);
    return`<div class="card-pick">
      ${imgSrc?`<img class="card-pick-img" src="${imgSrc}" alt="${c.name}" onerror="this.style.display='none'">`:
        `<div style="width:36px;height:50px;background:var(--surface2);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px">${c.color?'🃏':'🃏'}</div>`}
      <div class="card-pick-info"><div class="card-pick-name">${c.name}</div><div class="card-pick-num">#${c.n} · ${c.rare||''}</div></div>
      <div class="card-pick-check" onclick='addToBooster(${safeJSON(c)},"${setId}",${boosterN})' title="Adicionar">＋</div>
    </div>`;
  }).join('');
}

let _boosterSelected={}; // {boosterN: [{card, setId, ver}]}

function addToBooster(card,setId,boosterN){
  if(!_boosterSelected[boosterN])_boosterSelected[boosterN]=[];
  // Verificar duplicata
  if(_boosterSelected[boosterN].find(x=>x.card.n===card.n&&x.setId===setId))return;
  const slots=getSlots(card,setId);
  const defaultVer=slots[slots.length-1].ver; // última versão como padrão
  _boosterSelected[boosterN].push({card,setId,ver:defaultVer});
  renderBoosterSelected(boosterN,setId);
}

function removeFromBooster(boosterN,cardN){
  if(!_boosterSelected[boosterN])return;
  _boosterSelected[boosterN]=_boosterSelected[boosterN].filter(x=>x.card.n!==cardN);
  renderBoosterSelected(boosterN,_boosterSelected[boosterN]?.[0]?.setId||currentSet);
}

function changeBoosterVer(boosterN,cardN,ver){
  const item=(_boosterSelected[boosterN]||[]).find(x=>x.card.n===cardN);
  if(item)item.ver=ver;
}

function renderBoosterSelected(boosterN,setId){
  const items=_boosterSelected[boosterN]||[];
  const container=document.getElementById(`booster-selected-${boosterN}`);
  if(!container)return;
  if(!items.length){container.innerHTML='';return;}
  container.innerHTML=`<div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:6px">CARTAS ADICIONADAS</div>`+
    items.map(({card,setId:sid,ver})=>{
      const slots=getSlots(card,sid);
      const verOpts=slots.map(s=>`<option value="${s.ver}"${s.ver===ver?' selected':''}>${VER_LABEL[s.ver]}</option>`).join('');
      return`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(30,36,54,.5)">
        <div style="width:8px;height:8px;border-radius:2px;background:${VER_COLOR[ver]};flex-shrink:0"></div>
        <div style="flex:1;font-size:12px;font-weight:600">${card.name} <span style="color:var(--muted);font-size:10px">#${card.n}</span></div>
        <select style="background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:3px 6px;font-size:10px"
          onchange="changeBoosterVer(${boosterN},'${card.n}',this.value)">${verOpts}</select>
        <div onclick="removeFromBooster(${boosterN},'${card.n}')" style="cursor:pointer;color:var(--muted);font-size:16px;line-height:1" title="Remover">×</div>
      </div>`;
    }).join('');
}

async function saveBoosterOpening(){
  const sel=document.getElementById('open-purchase');
  const pid=sel.value;
  const purchase=purchases.find(p=>String(p.id)===String(pid));
  if(!purchase){alert('Selecione uma compra');return;}

  const allItems=Object.values(_boosterSelected).flat();
  if(!allItems.length){alert('Adicione pelo menos uma carta');return;}

  const d=new Date(purchase.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  const icons={Grama:'🌿',Fogo:'🔥',Aquático:'💧',Raio:'⚡',Psíquico:'🔮',Lutador:'🥊',Escuridão:'⚫',Metal:'⚙️',Dragão:'🐉',Incolor:'⬜'};

  const rows=allItems.map(({card,setId,ver})=>{
    const slots=getSlots(card,setId);
    const slot=slots.find(s=>s.ver===ver)||slots[0];
    const verBc={SP:'bi',F:'br',RH:'bx',N:'bx'};
    return{
      name:card.name,
      num:`${card.n} — ${VER_LABEL[ver]}`,
      rar:card.rare||'Regular',
      src:purchase.product.substring(0,60),
      lote:`${d} — ${setId.toUpperCase()} (Abertura)`,
      icon:icons[card.type||'']||'🃏',ic:'fp',
      bc:verBc[ver]||'bx',
      price:slot.price||card.price||null,
      psrc:'Abertura registrada'
    };
  });

  // Salvar cartas tiradas
  if(uid()){
    for(const row of rows){
      const{data:res}=await sbClient.from('pulled_cards').insert({...row,user_id:uid()}).select();
      if(Array.isArray(res))pulledCards.push(...res);
    }
    // Marcar slots como coletados
    for(const{card,setId,ver}of allItems){
      const key=slotKey(setId+':',card.n,ver);
      if(!collected.has(key)){
        collected.add(key);
        await sbClient.from('collection').upsert({slot_key:key,user_id:uid()},{onConflict:'user_id,slot_key'});
      }
    }
  }

  _boosterSelected={};
  closeModal('mopen');
  renderAll();
  alert(`✓ ${allItems.length} carta${allItems.length!==1?'s':''} registrada${allItems.length!==1?'s':''}! Fichário atualizado.`);
}

// ── MODAIS BASE ──────────────────────────────────────────────────
function openModal(id){
  document.getElementById(id).classList.add('open');
  if(id==='mp') document.getElementById('m-data').value=new Date().toISOString().split('T')[0];
  if(id==='mopen'){
    _boosterSelected={};
    // Preencher lista de compras (mais recente primeiro, já está order=date.desc)
    const sel=document.getElementById('open-purchase');
    sel.innerHTML='<option value="">— Selecione a compra —</option>'+
      purchases.filter(p=>!p.acessorio&&p.boost>0).map(p=>{
        const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
        return`<option value="${p.id}">${d} — ${p.product.substring(0,50)}</option>`;
      }).join('');
    document.getElementById('open-slots').innerHTML='';
  }
}
function closeModal(id){document.getElementById(id).classList.remove('open');}

// ── MODAIS COMPRA / CARTA ────────────────────────────────────────
const rIC={'Dupla Rara (RR)':'🔥','Ilustração Rara (IR)':'⭐','Ilustracao Rara (IR)':'⭐',
  'Ilustração Rara (SAR)':'⭐','Ilustracao Rara (SAR)':'⭐','Rara Ultra (UR)':'💎',
  'Rara (Holo)':'🌟','Incomum (RH)':'🟢','Comum (RH)':'🟢','Promocional':'🎁'};
const rBC={'Dupla Rara (RR)':'br','Ilustração Rara (IR)':'bi','Ilustracao Rara (IR)':'bi',
  'Ilustração Rara (SAR)':'bi','Ilustracao Rara (SAR)':'bi','Rara Ultra (UR)':'bi','Promocional':'bp'};

async function addPurchase(){
  if(!uid()) return;
  const prod=document.getElementById('m-prod').value.trim();
  const tipo=document.getElementById('m-tipo').value;
  const date=document.getElementById('m-data').value;
  const price=parseFloat(document.getElementById('m-preco').value);
  const boost=parseInt(document.getElementById('m-boost').value)||0;
  const acess=document.getElementById('m-acess').checked;
  if(!prod||isNaN(price))return;
  const{data:res}=await sbClient.from('purchases').insert({date,product:prod,tipo,boost,cards:boost*6,price,acessorio:acess,user_id:uid()}).select();
  if(Array.isArray(res))purchases.unshift(...res);
  closeModal('mp');renderGastos();renderDash();
}
async function addCard(){
  if(!uid()) return;
  const nome=document.getElementById('c-nome').value.trim();
  const num=document.getElementById('c-num').value.trim();
  const rar=document.getElementById('c-rar').value;
  const src=document.getElementById('c-src').value.trim();
  const lote=document.getElementById('c-lote').value.trim();
  const price=parseFloat(document.getElementById('c-val').value)||0;
  if(!nome)return;
  const{data:res}=await sbClient.from('pulled_cards').insert({name:nome,num,rar,src,lote,icon:rIC[rar]||'🃏',ic:'fp',bc:rBC[rar]||'bx',price,psrc:'Manual',user_id:uid()}).select();
  if(Array.isArray(res))pulledCards.push(...res);
  closeModal('mc');renderCartas();renderDash();
}

// ════════════════════════════════════════════════════════════════
// FICHÁRIOS PERSONALIZADOS
// ════════════════════════════════════════════════════════════════

let customBinders=[];
let _cbDraft={};
let _cbManualSelected=new Set();
let _currentCustomBinderId=null;

// ── Presets temáticos ─────────────────────────────────────────────
const BINDER_PRESETS=[
  {key:'ilustr_esp_rara', name:'Galeria das Estrelas',emoji:'🌟',desc:'Todas as Ilustração Especial Rara',   filter:c=>c.rare==='Ilustr. Esp. Rara',              color:'#a855f7'},
  {key:'ilustr_rara',     name:'Museu da Arte',       emoji:'🎨',desc:'Todas as Ilustração Rara',            filter:c=>c.rare==='Ilustr. Rara',                   color:'#118ab2'},
  {key:'mega_attack',     name:'Coroa Dourada',       emoji:'👑',desc:'Mega Attack Rare e importantes ★',    filter:c=>c.important||c.rare==='Mega Attack Rare',  color:'#ffd166'},
  {key:'vitrine',         name:'Minha Vitrine',       emoji:'⭐',desc:'Cartas marcadas como importantes ★', filter:c=>!!c.important,                             color:'#e63946'},
  {key:'tipo_fogo',       name:'Chamas do Caos',      emoji:'🔥',desc:'Cartas de tipo Fogo',                filter:c=>c.type==='Fogo',                           color:'#ff6b35'},
  {key:'tipo_aquatico',   name:'Abismo Oceânico',     emoji:'🌊',desc:'Cartas de tipo Aquático',            filter:c=>c.type==='Aquático',                       color:'#118ab2'},
  {key:'tipo_grama',      name:'Floresta Primordial', emoji:'🌿',desc:'Cartas de tipo Grama',               filter:c=>c.type==='Grama',                          color:'#06d6a0'},
  {key:'tipo_raio',       name:'Tempestade Elétrica', emoji:'⚡',desc:'Cartas de tipo Raio',                filter:c=>c.type==='Raio',                           color:'#ffd166'},
  {key:'tipo_escuridao',  name:'Véu das Sombras',     emoji:'👻',desc:'Cartas de tipo Escuridão',           filter:c=>c.type==='Escuridão',                      color:'#a855f7'},
  {key:'tipo_dragao',     name:'Dragões Ancestrais',  emoji:'🐉',desc:'Cartas de tipo Dragão',              filter:c=>c.type==='Dragão',                         color:'#e63946'},
  {key:'tipo_lutador',    name:'Arena dos Titãs',     emoji:'⚔️',desc:'Cartas de tipo Lutador',             filter:c=>c.type==='Lutador',                        color:'#ff6b35'},
  {key:'tipo_psiquico',   name:'Mente Cósmica',       emoji:'🧠',desc:'Cartas de tipo Psíquico',            filter:c=>c.type==='Psíquico',                       color:'#c084fc'},
  {key:'tipo_metal',      name:'Aço Inabalável',      emoji:'🤖',desc:'Cartas de tipo Metal',               filter:c=>c.type==='Metal',                          color:'#8d96b5'},
];

const IMG_FNS={me04:imgMe04,me03:imgMe03,me02:imgMe02,meg:imgMeg,mep:imgMep,me05:imgMe05,me06:imgMe06};
const CB_SET_LABELS={
  me04:'🔥 ME04 — Caos Ascendente',
  me03:'🔵 ME03 — Ordem Perfeita',
  me02:'👻 ME02 — Fogo Fantasmagórico',
  meg: '🌿 MEG — Megaevolução',
  mep: '⭐ MEP — Promos',
  me05:'🌑 ME05 — Negrura Absoluta',
  me06:'💎 ME06 — Esmeralda Tempestuosa',
};

function getAllCardsWithSet(){
  const sets=[
    {id:'me04',cards:typeof CARDS!=='undefined'?CARDS:[]},
    {id:'me03',cards:typeof CARDS_ME03!=='undefined'?CARDS_ME03:[]},
    {id:'me02',cards:typeof CARDS_ME02!=='undefined'?CARDS_ME02:[]},
    {id:'meg', cards:typeof CARDS_MEG!=='undefined'?CARDS_MEG:[]},
    {id:'mep', cards:typeof CARDS_MEP!=='undefined'?CARDS_MEP:[]},
    {id:'me05',cards:typeof CARDS_ME05!=='undefined'?CARDS_ME05:[]},
    {id:'me06',cards:typeof CARDS_ME06!=='undefined'?CARDS_ME06:[]},
  ];
  const result=[];
  sets.forEach(({id,cards})=>cards.forEach(c=>result.push({...c,_setId:id})));
  return result;
}

function getBinderCards(binder){
  const all=getAllCardsWithSet();
  const cfg=binder.filter_config||{};
  if(cfg.type==='manual'){
    const ids=binder.card_ids||[];
    return all.filter(c=>ids.some(id=>id.set===c._setId&&id.n===c.n));
  }
  if(cfg.type==='preset'){
    const preset=BINDER_PRESETS.find(p=>p.key===cfg.key);
    return preset?all.filter(preset.filter):[];
  }
  return[];
}

function binderProgress(binder){
  const cards=getBinderCards(binder);
  if(!cards.length)return 0;
  let col=0;
  cards.forEach(c=>{if(getSlots(c,c._setId).some(s=>collected.has(slotKey(c._setId+':',c.n,s.ver))))col++;});
  return Math.round(col/cards.length*100);
}

// ── Supabase CRUD ─────────────────────────────────────────────────
async function loadCustomBinders(){
  if(!uid())return;
  const{data}=await sbClient.from('custom_binders').select('*').eq('user_id',uid()).order('created_at',{ascending:false});
  customBinders=data||[];
}

async function saveCustomBinder(binder){
  if(!uid())return null;
  const payload={...binder,user_id:uid(),updated_at:new Date().toISOString()};
  if(payload.id){
    await sbClient.from('custom_binders').update(payload).eq('id',payload.id).eq('user_id',uid());
    const idx=customBinders.findIndex(b=>b.id===payload.id);
    if(idx>=0)customBinders[idx]={...customBinders[idx],...payload};
    return payload;
  }else{
    delete payload.id;
    const{data}=await sbClient.from('custom_binders').insert(payload).select();
    if(data?.[0])customBinders.unshift(data[0]);
    return data?.[0]||null;
  }
}

async function deleteCustomBinder(id){
  if(!uid()||!confirm('Excluir este fichário?'))return;
  await sbClient.from('custom_binders').delete().eq('id',id).eq('user_id',uid());
  customBinders=customBinders.filter(b=>b.id!==id);
  _currentCustomBinderId=null;
  renderCustomBindersHome();
}

// ── GALERIA PRINCIPAL ─────────────────────────────────────────────
function renderCustomBindersHome(){
  _currentCustomBinderId=null;
  ['fic-binder-controls','fic-set-info','binder-stats'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const bctl=document.querySelector('.bctl');if(bctl)bctl.style.display='none';

  const all=getAllCardsWithSet();

  const myHtml=customBinders.length===0
    ?`<div style="text-align:center;padding:40px 20px;color:var(--muted);font-family:'Space Mono',monospace;font-size:11px;line-height:2.2">
        Você ainda não criou nenhum fichário.<br>
        <span style="color:var(--accent)">Use os presets abaixo ou crie o seu próprio ✨</span>
      </div>`
    :`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px;margin-bottom:28px">
      ${customBinders.map(b=>{
        const cards=getBinderCards(b);
        const pct=binderProgress(b);
        const col=b.cover_color||'#a855f7';
        return`<div onclick="openCustomBinderView(${safeJSON(b)})"
          style="padding:16px;border-radius:10px;cursor:pointer;transition:all .2s;
                 border:1px solid var(--border);background:var(--surface2);position:relative;
                 border-left:3px solid ${col}"
          onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='${col}'"
          onmouseout="this.style.transform='';this.style.borderColor='var(--border)'">
          <div style="font-size:26px;margin-bottom:6px">${b.emoji||'📚'}</div>
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;word-break:break-word;line-height:1.3">${b.name}</div>
          <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:8px">${cards.length} cartas</div>
          <div style="height:3px;background:var(--surface3);border-radius:2px;overflow:hidden;margin-bottom:4px">
            <div style="height:100%;width:${pct}%;background:${col};border-radius:2px"></div>
          </div>
          <div style="font-size:9px;color:${col};font-family:'Space Mono',monospace">${pct}% coletado</div>
          <div style="position:absolute;top:6px;right:6px;display:flex;gap:4px">
            <button onclick="event.stopPropagation();openCreateBinderModal(${safeJSON(b)})"
              style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:2px;
                     opacity:.5;transition:opacity .15s" title="Editar"
              onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.5'">✏️</button>
            <button onclick="event.stopPropagation();deleteCustomBinder('${b.id}')"
              style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:2px;
                     opacity:.5;transition:opacity .15s" title="Excluir"
              onmouseover="this.style.opacity='1';this.style.color='var(--accent)'"
              onmouseout="this.style.opacity='.5';this.style.color='var(--muted)'">✕</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  const presetsHtml=BINDER_PRESETS.map(p=>{
    const count=all.filter(p.filter).length;
    const already=customBinders.some(b=>b.filter_config&&b.filter_config.key===p.key&&b.filter_config.type==='preset');
    return`<div onclick="openPresetPreview('${p.key}')"
      style="padding:14px;border-radius:10px;cursor:pointer;transition:all .2s;
             border:1px solid var(--border);background:var(--surface2);
             border-top:3px solid ${p.color};${already?'opacity:.55':''}position:relative"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 20px ${p.color}33'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="font-size:22px;margin-bottom:8px">${p.emoji}</div>
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">${p.name}</div>
      <div style="font-size:9px;color:var(--muted);line-height:1.5;margin-bottom:8px">${p.desc}</div>
      <div style="font-size:9px;color:${p.color};font-family:'Space Mono',monospace">${count} cartas${already?' · Já criado':''}</div>
    </div>`;
  }).join('');

  document.getElementById('bwrap').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px">✨ MEUS FICHÁRIOS</div>
      <button onclick="openCreateBinderModal()"
        style="padding:8px 18px;background:var(--accent);color:#fff;border:none;border-radius:6px;
               font-family:'Space Mono',monospace;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:1px;
               transition:opacity .15s"
        onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">+ NOVO FICHÁRIO</button>
    </div>
    ${myHtml}
    <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:2px;
                margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--border)">
      SUGESTÕES TEMÁTICAS
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
      ${presetsHtml}
    </div>`;
}

// ── VISUALIZADOR ──────────────────────────────────────────────────
function openCustomBinderView(binder){
  if(typeof binder==='string')binder=JSON.parse(binder);
  _currentCustomBinderId=binder.id||'__preview__';
  ['fic-binder-controls','fic-set-info','binder-stats'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const bctl=document.querySelector('.bctl');if(bctl)bctl.style.display='none';

  const cards=getBinderCards(binder);
  const layout=binder.layout||3;
  const color=binder.cover_color||'#a855f7';

  let colCount=0;
  cards.forEach(c=>{if(getSlots(c,c._setId).some(s=>collected.has(slotKey(c._setId+':',c.n,s.ver))))colCount++;});
  const pct=cards.length>0?Math.round(colCount/cards.length*100):0;

  const bySets={};
  cards.forEach(c=>{if(!bySets[c._setId])bySets[c._setId]=[];bySets[c._setId].push(c);});

  window._cbCurrentBinder={...binder};

  function buildGrid(lay){
    const cols=lay===2?'1fr 1fr':lay===4?'repeat(4,1fr)':'repeat(3,1fr)';
    return Object.entries(bySets).map(([setId,setCards])=>`
      <div class="bsec-lbl">${CB_SET_LABELS[setId]||setId}</div>
      <div style="display:grid;grid-template-columns:${cols};gap:8px;margin-bottom:18px">
        ${setCards.map(c=>{
          const anyCol=getSlots(c,setId).some(s=>collected.has(slotKey(setId+':',c.n,s.ver)));
          const allCol=getSlots(c,setId).every(s=>collected.has(slotKey(setId+':',c.n,s.ver)));
          const imgFn=IMG_FNS[setId];
          const imgSrc=imgFn?imgFn(c.n):'';
          return`<div onclick='openBinderModal(${safeJSON(c)},"${setId}")'
            title="${c.name} #${c.n}"
            style="aspect-ratio:2/3;border-radius:8px;overflow:hidden;cursor:pointer;position:relative;
                   border:1px solid ${anyCol?color:'var(--border)'};
                   box-shadow:${allCol?`0 0 14px ${color}55`:'none'};transition:all .2s"
            onmouseover="this.style.transform='translateY(-2px) scale(1.02)'"
            onmouseout="this.style.transform=''">
            <img src="${imgSrc}" alt="${c.name}" loading="lazy"
              style="width:100%;height:100%;object-fit:cover;
                     filter:${allCol?'none':anyCol?'saturate(.55) brightness(.7)':'grayscale(80%) brightness(.45)'}">
            ${allCol?`<div style="position:absolute;top:4px;right:4px;width:16px;height:16px;background:${color};
                       border-radius:50%;display:flex;align-items:center;justify-content:center;
                       font-size:8px;font-weight:700;color:#fff">✓</div>`:''}
            <div style="position:absolute;bottom:0;left:0;right:0;padding:3px 5px;
                        background:linear-gradient(transparent,rgba(0,0,0,.85));
                        font-size:7px;color:rgba(255,255,255,.65);font-family:'Space Mono',monospace">${c.n}</div>
          </div>`;
        }).join('')}
      </div>`).join('');
  }

  const isPreview=!!binder._preview;
  const layoutBtns=[2,3,4].map(n=>`<button onclick="changeCustomLayout(${n})"
    style="padding:4px 12px;border-radius:5px;border:1px solid ${n===layout?color:'var(--border)'};
           background:${n===layout?color+'22':'var(--surface2)'};
           color:${n===layout?color:'var(--muted)'};font-family:'Space Mono',monospace;font-size:10px;
           cursor:pointer;font-weight:${n===layout?700:400};transition:all .15s">${n}×${n}</button>`).join('');

  document.getElementById('bwrap').innerHTML=`
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="renderCustomBindersHome()"
        style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
               color:var(--muted);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">← Voltar</button>
      <div style="font-size:26px;line-height:1">${binder.emoji||'📚'}</div>
      <div style="flex:1;min-width:100px">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:var(--text)">${binder.name}</div>
        <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">${cards.length} cartas · ${colCount} coletadas</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;min-width:120px">
        <div style="flex:1;height:4px;background:var(--surface3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .4s"></div>
        </div>
        <span style="font-size:10px;color:${color};font-family:'Space Mono',monospace;font-weight:700;white-space:nowrap">${pct}%</span>
      </div>
      ${isPreview
        ?`<button onclick="createBinderFromPreset(${safeJSON(binder)})"
            style="padding:8px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;
                   font-family:'Space Mono',monospace;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:1px">+ SALVAR</button>`
        :`<button onclick="openCreateBinderModal(${safeJSON(binder)})"
            style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;
                   color:var(--muted);font-family:'Space Mono',monospace;font-size:10px;cursor:pointer">✏️ Editar</button>`
      }
    </div>
    <div style="display:flex;gap:6px;margin-bottom:16px">${layoutBtns}</div>
    <div id="cb-view-grid">
      ${cards.length===0
        ?'<div style="text-align:center;padding:50px;color:var(--muted);font-family:\'Space Mono\',monospace;font-size:11px">Nenhuma carta encontrada.</div>'
        :buildGrid(layout)}
    </div>`;
}

function changeCustomLayout(n){
  const b=window._cbCurrentBinder;
  if(!b)return;
  b.layout=n;
  window._cbCurrentBinder=b;
  if(b.id&&!b._preview){
    sbClient.from('custom_binders').update({layout:n,updated_at:new Date().toISOString()}).eq('id',b.id).eq('user_id',uid());
    const idx=customBinders.findIndex(x=>x.id===b.id);
    if(idx>=0)customBinders[idx].layout=n;
  }
  openCustomBinderView(b);
}

function openPresetPreview(key){
  const p=BINDER_PRESETS.find(x=>x.key===key);
  if(!p)return;
  openCustomBinderView({id:null,name:p.emoji+' '+p.name,emoji:p.emoji,layout:3,
    filter_config:{type:'preset',key},card_ids:[],cover_color:p.color,_preview:true});
}

async function createBinderFromPreset(previewBinder){
  if(typeof previewBinder==='string')previewBinder=JSON.parse(previewBinder);
  const{_preview,...payload}=previewBinder;
  delete payload.id;
  await saveCustomBinder(payload);
  const saved=customBinders[0];
  if(saved)openCustomBinderView(saved);
}

// ── MODAL CRIAR / EDITAR ──────────────────────────────────────────
function openCreateBinderModal(editBinder){
  if(typeof editBinder==='string')editBinder=JSON.parse(editBinder);
  _cbDraft=editBinder?{...editBinder}:{
    name:'',emoji:'📚',layout:3,
    filter_config:{type:'preset',key:'ilustr_esp_rara'},
    card_ids:[],cover_color:'#a855f7'
  };
  _cbManualSelected=new Set(
    (_cbDraft.filter_config&&_cbDraft.filter_config.type==='manual'?(_cbDraft.card_ids||[]):[])
    .map(id=>id.set+':'+id.n)
  );
  _renderCreateModal(!!editBinder,editBinder?editBinder.id:null);
  openModal('mcustom');
}

function _renderCreateModal(isEdit,editId){
  const colors=['#a855f7','#e63946','#ffd166','#06d6a0','#118ab2','#ff6b35','#c084fc','#8d96b5'];
  const emojis=['📚','🌟','🎨','👑','🔥','🌊','🌿','⚡','👻','🐉','⚔️','🧠','🤖','💎','🏆','🎯','🌈','🦋'];
  const ft=(_cbDraft.filter_config&&_cbDraft.filter_config.type)||'preset';
  const presetKey=(_cbDraft.filter_config&&_cbDraft.filter_config.key)||'ilustr_esp_rara';
  const curColor=_cbDraft.cover_color||'#a855f7';
  const curLayout=_cbDraft.layout||3;
  const all=getAllCardsWithSet();

  const presetGrid=BINDER_PRESETS.map(p=>{
    const cnt=all.filter(p.filter).length;
    const active=p.key===presetKey&&ft!=='manual';
    return`<div onclick="cbPickPreset('${p.key}')" id="cbp-${p.key}"
      style="padding:10px;border-radius:8px;cursor:pointer;transition:all .2s;
             border:1px solid ${active?p.color:'var(--border)'};
             background:${active?p.color+'22':'var(--surface2)'};
             ${active?'box-shadow:0 0 10px '+p.color+'44':''}">
      <div style="font-size:18px;margin-bottom:4px">${p.emoji}</div>
      <div style="font-size:10px;font-weight:700;color:${active?p.color:'var(--text)'};margin-bottom:2px;line-height:1.3">${p.name}</div>
      <div style="font-size:8px;color:var(--muted);font-family:'Space Mono',monospace">${cnt} cartas</div>
    </div>`;
  }).join('');

  document.getElementById('mcustom-content').innerHTML=`
    <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;margin-bottom:18px">
      ${isEdit?'✏️ EDITAR FICHÁRIO':'✨ NOVO FICHÁRIO'}
    </div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px">
      <div id="cb-emoji-disp" onclick="cbToggleEmojiPicker()"
        style="font-size:28px;cursor:pointer;padding:8px 10px;background:var(--surface2);
               border-radius:8px;border:1px solid var(--border);line-height:1;flex-shrink:0;
               transition:border-color .15s"
        onmouseover="this.style.borderColor='var(--accent)'"
        onmouseout="this.style.borderColor='var(--border)'">${_cbDraft.emoji||'📚'}</div>
      <input id="cb-name-inp" type="text" placeholder="Nome do fichário..." maxlength="40"
        value="${(_cbDraft.name||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}"
        oninput="_cbDraft.name=this.value"
        style="flex:1;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);
               border-radius:8px;color:var(--text);font-size:14px;font-family:'DM Sans',sans-serif;
               outline:none;transition:border-color .15s"
        onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
    </div>
    <div id="cb-emoji-pick" style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:12px;padding:10px;
                                    background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
      ${emojis.map(e=>`<span onclick="cbPickEmoji('${e}')"
        style="font-size:20px;cursor:pointer;padding:4px;border-radius:4px;transition:background .15s"
        onmouseover="this.style.background='var(--surface3)'"
        onmouseout="this.style.background=''">${e}</span>`).join('')}
    </div>
    <div style="margin-bottom:16px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">COR DO FICHÁRIO</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${colors.map(col=>`<div onclick="cbPickColor('${col}')" id="cbcol-${col.replace('#','')}"
          style="width:26px;height:26px;border-radius:50%;background:${col};cursor:pointer;
                 border:2px solid ${col===curColor?'#fff':'transparent'};
                 transition:all .15s;box-shadow:0 0 0 1px rgba(255,255,255,.1)"
          onmouseover="this.style.transform='scale(1.2)'"
          onmouseout="this.style.transform=''"></div>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:8px">VISUALIZAÇÃO PADRÃO</div>
      <div style="display:flex;gap:6px">
        ${[2,3,4].map(n=>`<button onclick="cbPickLayout(${n})" id="cblay-${n}"
          style="padding:6px 14px;border-radius:6px;
                 border:1px solid ${n===curLayout?'var(--accent)':'var(--border)'};
                 background:${n===curLayout?'rgba(230,57,70,.15)':'var(--surface2)'};
                 color:${n===curLayout?'var(--accent)':'var(--muted)'};
                 font-family:'Space Mono',monospace;font-size:11px;cursor:pointer;transition:all .15s;
                 font-weight:${n===curLayout?700:400}">${n}×${n}</button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);letter-spacing:1px;margin-bottom:10px">TIPO DE COLEÇÃO</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button onclick="cbPickFilterType('preset')" id="cbft-preset"
          style="padding:8px 14px;border-radius:6px;
                 border:1px solid ${ft!=='manual'?'var(--accent)':'var(--border)'};
                 background:${ft!=='manual'?'rgba(230,57,70,.15)':'var(--surface2)'};
                 color:${ft!=='manual'?'var(--accent)':'var(--muted)'};
                 font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;transition:all .15s">
          🏷️ Por tema / raridade
        </button>
        <button onclick="cbPickFilterType('manual')" id="cbft-manual"
          style="padding:8px 14px;border-radius:6px;
                 border:1px solid ${ft==='manual'?'var(--accent)':'var(--border)'};
                 background:${ft==='manual'?'rgba(230,57,70,.15)':'var(--surface2)'};
                 color:${ft==='manual'?'var(--accent)':'var(--muted)'};
                 font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;transition:all .15s">
          🃏 Seleção manual
        </button>
      </div>
      <div id="cbsec-preset" style="display:${ft==='manual'?'none':'block'}">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;
                    max-height:230px;overflow-y:auto;padding:4px">
          ${presetGrid}
        </div>
      </div>
      <div id="cbsec-manual" style="display:${ft==='manual'?'block':'none'}">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
          <input id="cb-msearch" type="text" placeholder="Buscar carta..." oninput="cbRenderManual()"
            style="padding:7px 12px;background:var(--surface2);border:1px solid var(--border);
                   border-radius:6px;color:var(--text);font-size:12px;flex:1;min-width:100px;outline:none">
          <select id="cb-mset" onchange="cbRenderManual()"
            style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);
                   border-radius:6px;color:var(--text);font-size:12px;cursor:pointer">
            <option value="">Todos os sets</option>
            <option value="me04">🔥 ME04</option>
            <option value="me03">🔵 ME03</option>
            <option value="me02">👻 ME02</option>
            <option value="meg">🌿 MEG</option>
            <option value="mep">⭐ MEP</option>
            <option value="me05">🌑 ME05</option>
          </select>
          <span id="cb-mcount" style="font-size:10px;color:var(--gold);font-family:'Space Mono',monospace;white-space:nowrap">${_cbManualSelected.size} selecionadas</span>
        </div>
        <div id="cb-mgrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));
                                   gap:6px;max-height:240px;overflow-y:auto;padding:4px"></div>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px">
      <button onclick="cbConfirmSave('${isEdit?editId:''}')"
        style="flex:1;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:8px;
               font-family:'Space Mono',monospace;font-size:12px;font-weight:700;cursor:pointer;
               letter-spacing:1px;transition:opacity .15s"
        onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
        ${isEdit?'✓ SALVAR':'✨ CRIAR FICHÁRIO'}
      </button>
      <button onclick="closeModal('mcustom')"
        style="padding:12px 18px;background:var(--surface2);color:var(--muted);border:1px solid var(--border);
               border-radius:8px;font-family:'Space Mono',monospace;font-size:12px;cursor:pointer">CANCELAR</button>
    </div>`;

  if(ft==='manual')setTimeout(cbRenderManual,0);
}

function cbToggleEmojiPicker(){
  const el=document.getElementById('cb-emoji-pick');
  if(el)el.style.display=el.style.display==='none'?'flex':'none';
}
function cbPickEmoji(e){
  _cbDraft.emoji=e;
  const d=document.getElementById('cb-emoji-disp');if(d)d.textContent=e;
  const p=document.getElementById('cb-emoji-pick');if(p)p.style.display='none';
}
function cbPickColor(col){
  _cbDraft.cover_color=col;
  document.querySelectorAll('[id^="cbcol-"]').forEach(el=>el.style.borderColor='transparent');
  const el=document.getElementById('cbcol-'+col.replace('#',''));
  if(el)el.style.borderColor='#fff';
}
function cbPickLayout(n){
  _cbDraft.layout=n;
  [2,3,4].forEach(x=>{
    const btn=document.getElementById('cblay-'+x);if(!btn)return;
    const a=x===n;
    btn.style.borderColor=a?'var(--accent)':'var(--border)';
    btn.style.background=a?'rgba(230,57,70,.15)':'var(--surface2)';
    btn.style.color=a?'var(--accent)':'var(--muted)';
    btn.style.fontWeight=a?'700':'400';
  });
}
function cbPickFilterType(type){
  _cbDraft.filter_config=type==='manual'
    ?{type:'manual'}
    :{type:'preset',key:(_cbDraft.filter_config&&_cbDraft.filter_config.key)||'ilustr_esp_rara'};
  ['preset','manual'].forEach(t=>{
    const btn=document.getElementById('cbft-'+t);if(!btn)return;
    const a=t===type;
    btn.style.borderColor=a?'var(--accent)':'var(--border)';
    btn.style.background=a?'rgba(230,57,70,.15)':'var(--surface2)';
    btn.style.color=a?'var(--accent)':'var(--muted)';
  });
  const ps=document.getElementById('cbsec-preset');
  const ms=document.getElementById('cbsec-manual');
  if(ps)ps.style.display=type==='manual'?'none':'block';
  if(ms){ms.style.display=type==='manual'?'block':'none';if(type==='manual')setTimeout(cbRenderManual,0);}
}
function cbPickPreset(key){
  _cbDraft.filter_config={type:'preset',key};
  BINDER_PRESETS.forEach(p=>{
    const el=document.getElementById('cbp-'+p.key);if(!el)return;
    const a=p.key===key;
    el.style.borderColor=a?p.color:'var(--border)';
    el.style.background=a?p.color+'22':'var(--surface2)';
    el.style.boxShadow=a?'0 0 10px '+p.color+'44':'';
  });
}
function cbRenderManual(){
  const q=(document.getElementById('cb-msearch')&&document.getElementById('cb-msearch').value||'').toLowerCase();
  const sf=(document.getElementById('cb-mset')&&document.getElementById('cb-mset').value)||'';
  const filtered=getAllCardsWithSet().filter(c=>{
    if(sf&&c._setId!==sf)return false;
    if(q&&!(c.name+c.n).toLowerCase().includes(q))return false;
    return true;
  }).slice(0,120);
  const grid=document.getElementById('cb-mgrid');
  if(!grid)return;
  grid.innerHTML=filtered.map(c=>{
    const k=c._setId+':'+c.n;
    const sel=_cbManualSelected.has(k);
    const imgFn=IMG_FNS[c._setId];
    const src=imgFn?imgFn(c.n):'';
    return`<div onclick="cbToggleManual('${c._setId}','${c.n}')" title="${c.name} #${c.n}"
      style="border-radius:6px;overflow:hidden;cursor:pointer;position:relative;
             border:2px solid ${sel?'var(--teal)':'transparent'};
             background:${sel?'rgba(6,214,160,.1)':'var(--surface2)'};transition:all .15s">
      <img src="${src}" alt="${c.n}"
        style="width:100%;display:block;aspect-ratio:2/3;object-fit:cover;
               filter:${sel?'none':'brightness(.5)'}">
      ${sel?'<div style="position:absolute;top:3px;right:3px;width:14px;height:14px;background:var(--teal);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7px;color:#000;font-weight:700">✓</div>':''}
      <div style="font-size:7px;text-align:center;padding:2px;color:var(--muted);font-family:\'Space Mono\',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.n}</div>
    </div>`;
  }).join('');
}
function cbToggleManual(setId,n){
  const k=setId+':'+n;
  _cbManualSelected.has(k)?_cbManualSelected.delete(k):_cbManualSelected.add(k);
  cbRenderManual();
  const cnt=document.getElementById('cb-mcount');
  if(cnt)cnt.textContent=_cbManualSelected.size+' selecionadas';
}

async function cbConfirmSave(editId){
  const name=((document.getElementById('cb-name-inp')&&document.getElementById('cb-name-inp').value)||_cbDraft.name||'').trim();
  if(!name){alert('Dê um nome ao fichário!');return;}
  const isManual=_cbDraft.filter_config&&_cbDraft.filter_config.type==='manual';
  const payload={
    ...(editId?{id:editId}:{}),
    name,
    emoji:_cbDraft.emoji||'📚',
    layout:_cbDraft.layout||3,
    filter_config:_cbDraft.filter_config||{type:'preset',key:'ilustr_esp_rara'},
    card_ids:isManual
      ?Array.from(_cbManualSelected).map(k=>{const parts=k.split(':');return{set:parts[0],n:parts[1]};})
      :[],
    cover_color:_cbDraft.cover_color||'#a855f7',
  };
  closeModal('mcustom');
  await saveCustomBinder(payload);
  const binder=editId
    ?customBinders.find(b=>b.id===editId)
    :customBinders[0];
  if(binder)openCustomBinderView(binder);
  else renderCustomBindersHome();
}

/* ═══════════════════════════════════════════════════════════════
   HOME PAGE — CARD ROTATION (top 3 por preço de cada coleção)
   ═══════════════════════════════════════════════════════════════ */
(function initHomeRotation(){
  const INTERVAL = 3800; // ms entre cada card

  // Formata preço BR
  function fmtPriceBR(p){
    if(p>=1000) return 'R$ '+Math.round(p).toLocaleString('pt-BR');
    if(p>=100)  return 'R$ '+p.toFixed(0);
    return 'R$ '+p.toFixed(2).replace('.',',');
  }

  function setupRotation(el){
    let raw;
    try{ raw=JSON.parse(el.dataset.cards); }catch(e){ return; }
    if(!raw||raw.length<2) return;

    const setId   = el.dataset.setid;
    const imgEl   = el.querySelector('.hset-img-wrap img');
    const badgeEl = el.querySelector('.hset-price-badge');
    const rankEl  = el.querySelector('.hset-rank-badge');
    const nameEl  = el.querySelector('.hset-card-name');
    const dots    = el.querySelectorAll('.hset-dot');

    let idx = 0;

    function showCard(i, animate){
      const c = raw[i];
      const url = 'https://images.scrydex.com/pokemon/'+setId+'-'+c.n+'/large';

      if(animate && imgEl){
        imgEl.classList.add('fading');
        setTimeout(()=>{
          imgEl.src = url;
          imgEl.classList.remove('fading');
        }, 480);
      } else if(imgEl){
        imgEl.src = url;
      }

      if(badgeEl) badgeEl.textContent = fmtPriceBR(c.price);
      if(rankEl)  rankEl.textContent  = i+1;
      if(nameEl)  nameEl.textContent  = c.name;

      dots.forEach((d,di)=>{
        d.classList.toggle('active', di===i);
      });
    }

    // Clique nos dots para navegar manualmente
    dots.forEach((d,di)=>{
      d.addEventListener('click', (e)=>{
        e.stopPropagation();
        idx=di;
        showCard(idx, true);
      });
    });

    setInterval(()=>{
      idx = (idx+1) % raw.length;
      showCard(idx, true);
    }, INTERVAL + Math.random()*600); // offset aleatório para não sincroni­zar
  }

  function init(){
    document.querySelectorAll('.hset[data-cards]').forEach(setupRotation);
  }

  // Aguarda DOM pronto
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* goShop — helper para ir à aba shopping */
function goShop(){
  const shopTab = document.querySelector('.tabs .tab:last-child');
  if(shopTab) go('shopping', shopTab);
}
