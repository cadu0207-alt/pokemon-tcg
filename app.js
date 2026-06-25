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
    const[{data:p},{data:c},{data:col}]=await Promise.all([
      sbClient.from('purchases').select('*').order('date',{ascending:false}),
      sbClient.from('pulled_cards').select('*').order('id',{ascending:true}),
      sbClient.from('collection').select('slot_key')
    ]);
    purchases=Array.isArray(p)?p:[];
    pulledCards=Array.isArray(c)?c:[];
    collected=new Set((Array.isArray(col)?col:[]).map(r=>r.slot_key));
    setStatus('Online ✓','ok');
    renderAll();updateHomeStats();
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
  if(id==='fichario') renderBinder();
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
  me05:{label:'🌑 ME05 — Negrura Absoluta',color:'#424242',chase:'Mega Darkrai ex Gold — R$1.200 (est.)',heroCard:61,imgFn:imgMe05,upcoming:true,releaseDate:'ago/2026'},
  me04:{label:'🔥 ME04 — Caos Ascendente',color:'var(--accent)',chase:'Mega Greninja ex Gold — R$1.482',heroCard:22,imgFn:imgMe04},
  me03:{label:'🔵 ME03 — Ordem Perfeita',color:'#1565C0',chase:'Mega Zygarde ex Gold — R$980',heroCard:63,imgFn:imgMe03},
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
  el.classList.add('active');renderBinder();
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

// ── INIT ────────────────────────────────────────────────────────