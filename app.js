// ============================================================
// Pokémon TCG Dashboard — app.js v2
// ============================================================
const SUPABASE_URL='https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SUPABASE_KEY='sb_publishable_f4d1JHAzTWPWYAI0Vm6aRA_NwM-uzr3';
const sb={
  h:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json','Prefer':'return=representation'},
  async get(t,p=''){return(await fetch(`${SUPABASE_URL}/rest/v1/${t}?${p}`,{headers:this.h})).json();},
  async post(t,b){return(await fetch(`${SUPABASE_URL}/rest/v1/${t}`,{method:'POST',headers:this.h,body:JSON.stringify(b)})).json();},
  async del(t,f){await fetch(`${SUPABASE_URL}/rest/v1/${t}?${f}`,{method:'DELETE',headers:this.h});},
  async upsert(t,b){const h={...this.h,'Prefer':'resolution=merge-duplicates,return=representation'};return(await fetch(`${SUPABASE_URL}/rest/v1/${t}`,{method:'POST',headers:h,body:JSON.stringify(b)})).json();}
};

// IMAGENS
function imgMe04(n){return`https://images.scrydex.com/pokemon/me4-${parseInt(n)}/large`;}
function imgMe02(n){return`https://images.scrydex.com/pokemon/me2-${parseInt(n)}/large`;}
function imgMeg(n) {return`https://images.scrydex.com/pokemon/me1-${parseInt(n)}/large`;}

function getPurchaseImg(product){
  const p=product.toLowerCase();
  if(p.includes('me04')||p.includes('caos')||p.includes('chaos'))  return p.includes('quádr')||p.includes('quadr')?imgMe04(15):imgMe04(22);
  if(p.includes('me02')||p.includes('fogo')||p.includes('phantasmal')) return imgMe02(13);
  if(p.includes('meg')||p.includes('me01')||p.includes('megaevolução')||p.includes('megaevolucao')) return imgMeg(3);
  if(p.includes('parceiros')||p.includes('partner')) return imgMe04(20);
  return imgMe04(22);
}

function getCardImg(card){
  const num=(card.num||'').match(/(\d+)/);
  if(!num) return null;
  const n=num[1];
  const lote=(card.lote||'').toLowerCase();
  const ns=card.num||'';
  if(lote.includes('me02')||lote.includes('phantasmal')||lote.includes('fogo')) return imgMe02(n);
  if(lote.includes('meg')||lote.includes('me01')||ns.includes('/132')) return imgMeg(n);
  if(lote.includes('me04')||lote.includes('caos')||lote.includes('chaos')) return imgMe04(n);
  return imgMe04(Math.min(parseInt(n)||1,122));
}

function getBinderImg(c,setId){
  const n=parseInt(c.n);
  if(setId==='me02') return imgMe02(n);
  if(setId==='meg')  return imgMeg(n);
  return imgMe04(n);
}

// CÂMBIO
let USD_BRL=5.70;
async function fetchCambio(){
  try{const r=await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL');const d=await r.json();USD_BRL=d.rates.BRL;document.getElementById('usd-brl').textContent=`USD/BRL R$${USD_BRL.toFixed(2)}`;}catch(e){}
}

// ESTADO
let purchases=[],pulledCards=[],collected=new Set();

// VERSÕES
const VER_COLOR={N:'#c8cfe8',F:'#118ab2',RH:'#06d6a0',SP:'#ff6b35'};
const VER_LABEL={N:'N',F:'F',RH:'RH',SP:'★'};
function getSlots(c,setId){
  const r=c.rare||'';
  if(!c.base) return [{ver:'SP',price:c.price}];
  if(r.includes('Dupla')||r.includes('RR')) return [{ver:'F',price:c.price}];
  if(r==='Rara'||r.startsWith('Rara ')) return [{ver:'N',price:c.price},{ver:'F',price:c.priceF||(c.price?+(c.price*1.5).toFixed(2):null)},{ver:'RH',price:c.priceRH||(c.price?+(c.price*1.2).toFixed(2):null)}];
  return [{ver:'N',price:c.price},{ver:'RH',price:c.priceRH||(c.price?+(c.price*1.2).toFixed(2):null)}];
}
function slotKey(pfx,n,ver){return`${pfx}${n}:${ver}`;}
function getVerFromRar(rar){
  if(rar.includes('SAR')||rar.includes('UR')||rar.includes('IR')||rar.includes('Promo')) return 'SP';
  if(rar.includes('RR')||rar.includes('Dupla')||(rar.includes('Holo')&&rar.includes('Rara'))) return 'F';
  if(rar.includes('RH')||rar.includes('Reverse')) return 'RH';
  return 'N';
}

// LOAD
async function loadAll(){
  setStatus('Conectando...','warning');
  try{
    const[p,c,col]=await Promise.all([sb.get('purchases','order=date.asc'),sb.get('pulled_cards','order=id.asc'),sb.get('collection','select=slot_key')]);
    purchases=Array.isArray(p)?p:[];pulledCards=Array.isArray(c)?c:[];collected=new Set((Array.isArray(col)?col:[]).map(r=>r.slot_key));
    setStatus('Online ✓','ok');renderAll();updateHomeStats();
  }catch(e){setStatus('Erro de conexão','error');}
}
function setStatus(txt,state){document.getElementById('status-txt').textContent=txt;document.getElementById('status-dot').className=`dot dot-${state}`;}

async function toggleSlot(key){
  if(collected.has(key)){collected.delete(key);await sb.del('collection',`slot_key=eq.${encodeURIComponent(key)}`);}
  else{collected.add(key);await sb.upsert('collection',{slot_key:key});}
  renderBinder();updateDashProgress();
}

// PÁGINAS
function goPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id==='home'?'pg-home':'pg-app').classList.add('active');
  if(id==='app') window.scrollTo(0,0);
}

// ABAS
function go(id,el){
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');el.classList.add('active');
  if(id==='fichario') renderBinder();
  if(id==='dash') updateDashProgress();
}

function renderAll(){renderDash();renderGastos();renderCartas();updateDashProgress();}
const fmtR=v=>(+v||0).toFixed(2).replace('.',',');
const kpiHTML=(cls,lbl,val,sub)=>`<div class="kpi ${cls}"><div class="kpi-label">${lbl}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div></div>`;
const barHTML=(lbl,v,max,color,txt)=>{const w=max>0?Math.round(v/max*100):0;return`<div class="brow"><div class="blbl">${lbl}</div><div class="btrack"><div class="bfill" style="width:${w}%;background:${color}">${txt}</div></div></div>`;};

function updateHomeStats(){
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const el=document.getElementById('home-stats');
  if(el) el.textContent=`R$${fmtR(invested)} investidos · ${pulledCards.length} cartas tiradas · R$${fmtR(pull)} em valor`;
}

function initParticles(){
  const container=document.getElementById('particles');
  if(!container)return;
  for(let i=0;i<30;i++){
    const p=document.createElement('div');p.className='particle';
    p.style.cssText=`left:${Math.random()*100}%;width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;animation-duration:${8+Math.random()*12}s;animation-delay:${-Math.random()*20}s;opacity:${.2+Math.random()*.3};background:${['#e63946','#118ab2','#06d6a0','#ffd166'][Math.floor(Math.random()*4)]}`;
    container.appendChild(p);
  }
}

// DASHBOARD
function renderDash(){
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const bst=purchases.filter(p=>!p.acessorio);
  const tb=bst.reduce((s,p)=>s+p.boost,0);const tg=bst.reduce((s,p)=>s+Number(p.price),0);
  const pull=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const roi=invested>0?(pull/invested*100).toFixed(0):0;const apb=tb>0?(tg/tb).toFixed(2):'0,00';
  document.getElementById('kpi-dash').innerHTML=
    kpiHTML('red','💰 Total Investido','R$'+fmtR(invested),purchases.length+' compras')+
    kpiHTML('orange','📦 Boosters',''+tb,'~'+(tb*6)+' cartas')+
    kpiHTML('gold','💵 R$/Booster','R$'+apb.replace('.',','),'média ponderada')+
    kpiHTML('teal','💎 Valor Pull','R$'+fmtR(pull),pulledCards.length+' cartas')+
    kpiHTML('blue','📊 Retorno',roi+'%','valor tirado ÷ gasto');

  const rarCount={},rarVer={};
  pulledCards.forEach(c=>{
    const raw=c.rar||'';let k='Outro',ver='N';
    if(raw.includes('SAR')) {k='SAR';ver='SP';}
    else if(raw.includes('RR')||raw.includes('Dupla')){k='Dupla Rara';ver='F';}
    else if(raw.includes('UR')){k='Rara Ultra';ver='SP';}
    else if(raw.includes('IR')||raw.includes('Ilustr')){k='Ilustr. Rara';ver='SP';}
    else if(raw.includes('Promo')){k='Promo';ver='SP';}
    else if(raw.includes('Holo')&&raw.includes('Rara')){k='Rara Holo';ver='F';}
    else if(raw.includes('RH')){k='Reverse Holo';ver='RH';}
    rarCount[k]=(rarCount[k]||0)+1;rarVer[k]=ver;
  });
  const rarMax=Math.max(...Object.values(rarCount),1);
  document.getElementById('chart-rarity').innerHTML=Object.entries(rarCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
    const ver=rarVer[k]||'N';const col=VER_COLOR[ver];
    return`<div class="brow"><div class="blbl" style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:3px;background:${col};flex-shrink:0"></div>${k}</div><div class="btrack"><div class="bfill" style="width:${Math.round(v/rarMax*100)}%;background:${col}">${v}</div></div></div>`;
  }).join('')||'<div style="color:var(--muted);font-size:12px">Sem cartas</div>';

  const byDate={};purchases.forEach(p=>{byDate[p.date]=(byDate[p.date]||0)+Number(p.price);});
  const dgMax=Math.max(...Object.values(byDate),1);
  document.getElementById('chart-gastos').innerHTML=Object.entries(byDate).map(([d,v])=>barHTML(d.slice(5),v,dgMax,'linear-gradient(90deg,var(--accent),var(--accent2))','R$'+fmtR(v))).join('');

  const rl={'Dupla Rara (RR)':'RR','Ilustração Rara (SAR)':'SAR','Ilustracao Rara (SAR)':'SAR','Ilustração Rara (IR)':'IR','Ilustracao Rara (IR)':'IR','Rara Ultra (UR)':'UR','Rara (Holo)':'HOLO','Incomum (RH)':'RH','Comum (RH)':'RH','Promocional':'PROMO'};
  const top=[...pulledCards].sort((a,b)=>(b.price||0)-(a.price||0)).slice(0,6);
  document.getElementById('dash-highlights').innerHTML=top.map(c=>{
    const imgSrc=getCardImg(c);const ver=getVerFromRar(c.rar||'');
    return`<div class="pc" onclick="openCardModal(${JSON.stringify(c).replace(/"/g,'&quot;')})">
      ${imgSrc?`<img class="pc-img" src="${imgSrc}" alt="${c.name}" onerror="this.style.display='none'">`:
        `<div class="pc-icon ${c.ic||'fp'}">${c.icon||'🃏'}</div>`}
      <div class="pc-info"><div class="pc-name">${c.name}</div><div class="pc-meta">${c.num||''}</div>
        <div class="pc-src">${c.lote||''}</div>
        <div class="ver-dots"><div class="ver-dot" style="background:${VER_COLOR[ver]};border-color:${VER_COLOR[ver]}"></div></div></div>
      <div class="pc-right"><span class="rb ${c.bc||'bx'}">${rl[c.rar]||c.rar?.split(' ')[0]||''}</span>
        ${c.price?`<div class="pc-price">R$${fmtR(c.price)}</div>`:''}</div></div>`;
  }).join('');
}

// PROGRESS
const SET_META={
  me04:{cards:null,label:'🔥 ME04 — Caos Ascendente',color:'var(--accent)',chase:'Mega Greninja ex Gold — R$1.482',heroCard:22},
  me02:{cards:null,label:'👻 ME02 — Fogo Fantasmagórico',color:'#9C27B0',chase:'Mega Charizard X ex SAR — R$1.809',heroCard:13},
  meg: {cards:null,label:'🌿 MEG — Megaevolução',color:'#4CAF50',chase:'Mega Greninja ex UR — R$60',heroCard:3},
};
function countSlotsFor(cards,pfx){let total=0,col=0;cards.forEach(c=>{getSlots(c,pfx).forEach(s=>{total++;if(collected.has(slotKey(pfx+':',c.n,s.ver)))col++;});});return{total,col};}
function updateDashProgress(){
  SET_META.me04.cards=CARDS;SET_META.me02.cards=CARDS_ME02;SET_META.meg.cards=CARDS_MEG;
  let grand=0,grandC=0;
  const html=Object.entries(SET_META).map(([id,meta])=>{
    const base=countSlotsFor(meta.cards.filter(c=>c.base),id);
    const sec=countSlotsFor(meta.cards.filter(c=>!c.base),id);
    const tot=base.total+sec.total,col=base.col+sec.col;
    grand+=tot;grandC+=col;const pct=tot>0?(col/tot*100).toFixed(0):0;
    const imgFn=id==='me02'?imgMe02:id==='meg'?imgMeg:imgMe04;
    return`<div class="panel" style="border-color:${meta.color}44;overflow:hidden;position:relative">
      <div style="position:absolute;right:-10px;top:-10px;width:80px;height:110px;opacity:.1;pointer-events:none">
        <img src="${imgFn(meta.heroCard)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="flex:1"><div style="font-weight:700;font-size:13px">${meta.label}</div>
        <div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">${tot} slots · master set</div></div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;color:${meta.color};line-height:1">${pct}%</div>
      </div>
      <div class="prog"><div class="prog-lbl"><span>Base</span><span>${base.col}/${base.total}</span></div>
        <div class="prog-t"><div class="prog-f" style="width:${base.total>0?(base.col/base.total*100).toFixed(1):0}%;background:${meta.color}"></div></div></div>
      <div class="prog" style="margin:0"><div class="prog-lbl"><span>Secretas</span><span>${sec.col}/${sec.total}</span></div>
        <div class="prog-t"><div class="prog-f" style="width:${sec.total>0?(sec.col/sec.total*100).toFixed(1):0}%;background:${meta.color}88"></div></div></div>
      <div style="margin-top:10px;font-size:10px;font-family:'Space Mono',monospace;color:var(--muted)">Chase: <span style="color:${meta.color}">${meta.chase}</span></div>
    </div>`;
  }).join('');
  document.getElementById('progress-sets').innerHTML=html;
  const pct=grand>0?(grandC/grand*100).toFixed(1):0;
  const imp=[...(CARDS||[]),...(CARDS_ME02||[]),...(CARDS_MEG||[])].filter(c=>c.important).length;
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

// GASTOS
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
    ${kpiHTML('blue','📊 Retorno',roi+'%',pull>=total?'✅ acima':'📉 abaixo')}
  </div>`;

  document.getElementById('gastos-cards').innerHTML=purchases.map(p=>{
    const pb=p.boost>0?(Number(p.price)/p.boost).toFixed(2):null;
    const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
    const imgSrc=getPurchaseImg(p.product);
    return`<div class="pcard">
      <div class="pcard-img-wrap">
        <img src="${imgSrc}" alt="${p.product}" onerror="this.style.display='none'">
        <div class="pcard-img-overlay"></div>
        <div class="pcard-img-label">${p.tipo.toUpperCase()}</div>
      </div>
      <div class="pcard-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span class="pill pt">${p.tipo}</span>
              <span style="font-size:11px;color:var(--muted);font-family:'Space Mono',monospace">${d}</span>
              ${p.acessorio?'<span class="pill" style="background:rgba(107,117,153,.2);color:var(--muted)">ACESSÓRIO</span>':''}
            </div>
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p.product}</div>
            ${p.boost>0?`<div style="font-size:11px;color:var(--muted)">${p.boost} boosters · ~${p.cards} cartas</div>`:''}
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
            <div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--accent);line-height:1">R$${fmtR(p.price)}</div>
              <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">PAGO</div></div>
            ${pb?`<div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--gold);line-height:1">R$${pb.replace('.',',')}</div>
              <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace">POR BOOSTER</div></div>`:''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('tlwrap').innerHTML=purchases.map(p=>{
    const d=new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
    const pb=p.boost>0?(Number(p.price)/p.boost).toFixed(2):null;
    return`<div class="tli"><div class="tl-date">${d}</div><div class="tl-desc">${p.product}</div>
      <div class="tl-amt">R$${fmtR(p.price)}${pb?` · <span style="color:var(--gold)">R$${pb.replace('.',',')}/booster</span>`:''}</div></div>`;
  }).join('');
}

// CARTAS TIRADAS
function renderCartas(){
  const total=pulledCards.reduce((s,c)=>s+Number(c.price||0),0);
  const invested=purchases.reduce((s,p)=>s+Number(p.price),0);
  const roi=invested>0?(total/invested*100).toFixed(0):0;
  document.getElementById('cards-hdr').innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:22px">
    ${kpiHTML('teal','💎 Valor Pull','R$'+fmtR(total),pulledCards.length+' cartas')}
    ${kpiHTML('gold','📊 % Investimento',roi+'%','de R$'+fmtR(invested))}
    ${kpiHTML('red','🛍️ Investido','R$'+fmtR(invested),purchases.length+' compras')}
    ${kpiHTML('blue','📚 Sets','3','ME04 · ME02 · MEG')}
  </div>`;
  const rl={'Dupla Rara (RR)':'RR','Ilustração Rara (SAR)':'SAR','Ilustracao Rara (SAR)':'SAR','Ilustração Rara (IR)':'IR','Ilustracao Rara (IR)':'IR','Rara Ultra (UR)':'UR','Rara (Holo)':'HOLO','Incomum (RH)':'RH','Comum (RH)':'RH','Promocional':'PROMO'};
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
      html+=`<div class="pc" onclick="openCardModal(${JSON.stringify(c).replace(/"/g,'&quot;')})">
        ${imgSrc?`<img class="pc-img" src="${imgSrc}" alt="${c.name}" onerror="this.style.display='none'">`:
          `<div class="pc-icon ${c.ic||'fp'}">${c.icon||'🃏'}</div>`}
        <div class="pc-info"><div class="pc-name">${c.name}</div><div class="pc-meta">${c.num||''}</div>
          ${c.psrc?`<div class="pc-src">📊 ${c.psrc}</div>`:''}${mm}
          <div class="ver-dots"><div class="ver-dot" style="background:${VER_COLOR[ver]};border-color:${VER_COLOR[ver]}"></div></div></div>
        <div class="pc-right"><span class="rb ${c.bc||'bx'}">${rl[c.rar]||c.rar?.split(' ')[0]||''}</span>
          ${c.price?`<div class="pc-price">R$${fmtR(c.price)}</div>`:''}</div></div>`;
    });
    html+='</div>';
  });
  document.getElementById('cards-list').innerHTML=html;
}

// MODAL CARTA
function openCardModal(card){
  if(typeof card==='string') card=JSON.parse(card);
  const imgSrc=getCardImg(card);const ver=getVerFromRar(card.rar||'');
  document.getElementById('card-modal-content').innerHTML=`
    ${imgSrc?`<img class="cmc-img" src="${imgSrc}" alt="${card.name}" onerror="this.style.display='none'">`:
      `<div style="height:200px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:48px">${card.icon||'🃏'}</div>`}
    <div class="cmc-body">
      <div class="cmc-title">${card.name}</div>
      <div class="cmc-sub">${card.num||''} · ${card.rar||''}</div>
      <div class="cmc-grid">
        <div class="cmc-item"><label>Origem</label><span>${card.src||'—'}</span></div>
        <div class="cmc-item"><label>Lote</label><span>${(card.lote||'—').split('—').pop().trim()}</span></div>
        <div class="cmc-item"><label>Valor Médio</label><span style="color:var(--teal)">${card.price?'R$'+fmtR(card.price):'—'}</span></div>
        <div class="cmc-item"><label>Fonte</label><span>${card.psrc||'—'}</span></div>
        ${card.pmin&&card.pmax?`<div class="cmc-item"><label>Mínimo</label><span>R$${fmtR(card.pmin)}</span></div><div class="cmc-item"><label>Máximo</label><span>R$${fmtR(card.pmax)}</span></div>`:''}
      </div>
      <div class="cmc-vers">
        <div class="cmc-dot" style="background:${VER_COLOR[ver]};border-radius:3px;width:12px;height:12px"></div>
        <span style="font-family:'Space Mono',monospace;font-size:10px">${VER_LABEL[ver]} — ${ver}</span>
        <div style="flex:1"></div>
        <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted)">${new Date().toLocaleDateString('pt-BR')}</div>
      </div>
    </div>`;
  openModal('card-modal');
}

// FICHÁRIO
let currentSet='me04';
function switchSet(id,el){currentSet=id;document.querySelectorAll('.ctab').forEach(t=>t.classList.remove('active'));el.classList.add('active');renderBinder();}
function getSetData(){
  if(currentSet==='me02') return{cards:CARDS_ME02,imgFn:imgMe02,label:'ME02 — Fogo Fantasmagórico',sections:[{lbl:'📄 Base — 001 a 094',filter:c=>c.base},{lbl:'✨ Secretas — 095 a 130',filter:c=>!c.base}]};
  if(currentSet==='meg')  return{cards:CARDS_MEG,imgFn:imgMeg,label:'MEG — Megaevolução',sections:[{lbl:'📄 Base — 001 a 132',filter:c=>c.base},{lbl:'✨ Secretas — 133 a 188',filter:c=>!c.base}]};
  return{cards:CARDS,imgFn:imgMe04,label:'ME04 — Caos Ascendente',sections:[{lbl:'📄 Base — 001 a 086',filter:c=>c.base},{lbl:'✨ Secretas — 087 a 122',filter:c=>!c.base}]};
}

function renderBinder(){
  const{cards,imgFn,label,sections}=getSetData();
  const pfx=currentSet;
  const q=document.getElementById('bsrch').value.toLowerCase();
  const oc=document.getElementById('fc').checked,om=document.getElementById('fm').checked,oi=document.getElementById('fi2').checked;
  let totalSlots=0,colSlots=0;
  cards.forEach(c=>{getSlots(c,pfx).forEach(s=>{totalSlots++;if(collected.has(slotKey(pfx+':',c.n,s.ver)))colSlots++;});});
  const pct=totalSlots>0?(colSlots/totalSlots*100).toFixed(0):0;
  const totalBase=pfx==='me04'?86:pfx==='me02'?94:132;

  function cardVisible(c){
    const term=(c.name+c.n+c.type).toLowerCase();
    if(q&&!term.includes(q)) return false;
    const anyCol=getSlots(c,pfx).some(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    if(oc&&!anyCol) return false;if(om&&anyCol) return false;if(oi&&!c.important) return false;
    return true;
  }

  function buildCard(c){
    if(!cardVisible(c)) return'';
    const slots=getSlots(c,pfx);
    const allCol=slots.every(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    const anyCol=slots.some(s=>collected.has(slotKey(pfx+':',c.n,s.ver)));
    const numLabel=`${c.n}/${String(totalBase).padStart(3,'0')}`;
    const imgSrc=getBinderImg(c,pfx);
    const versBoxes=slots.map(s=>{
      const key=slotKey(pfx+':',c.n,s.ver);const isCol=collected.has(key);const col=VER_COLOR[s.ver];
      const priceStr=s.price?`R$${fmtR(s.price)}`:'';
      return`<div class="vslot${isCol?' vslot-col':''}" onclick="event.stopPropagation();toggleSlot('${key}')" title="${s.ver}${priceStr?' — '+priceStr:''}">
        <div class="vdot" style="background:${isCol?col:'transparent'};border-color:${col};color:${isCol?'#08090d':col}">${isCol?'✓':VER_LABEL[s.ver]}</div>
        <div class="vnum">${numLabel}</div>${priceStr?`<div class="vprice">${priceStr}</div>`:''}
      </div>`;
    }).join('');
    return`<div class="bc2${allCol?' collected':''}${anyCol&&!allCol?' bc2-partial':''}${c.important?' important':''}"
      title="${c.name}" onclick="openBinderCardModal(${JSON.stringify(c).replace(/"/g,'&quot;')},'${pfx}')">
      <div class="bc2-in">
        <img src="${imgSrc}" alt="${c.name}" loading="lazy"
          style="filter:${allCol?'none':anyCol?'saturate(.6) brightness(.75)':'grayscale(80%) brightness(.6)'}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="fb"><div class="fb-n">${c.n}</div><div class="fb-name">${c.name}</div>
          <div class="fb-t">${c.type}</div><div class="fb-stripe" style="background:${c.color}"></div></div>
        <div class="vslots">${versBoxes}</div>
      </div>
      <div class="chk">✓</div>
      <div class="tip"><div class="tip-n">${c.name}</div><div class="tip-nr">#${c.n} · ${c.type}</div>
        <div class="tip-r">${c.rare}</div>${c.price?`<div class="tip-p">R$${fmtR(c.price)}</div>`:''}
        ${c.important?`<div class="tip-imp">★ Importante</div>`:''}</div>
    </div>`;
  }

  const setInfo=`<div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:14px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
    <span>${label}</span><span style="color:var(--teal)">${colSlots}/${totalSlots} slots</span>
    <span style="color:var(--gold)">${pct}% master set</span>
    <div style="flex:1;min-width:120px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:2px"></div></div>
  </div>`;
  let html=setInfo;
  sections.forEach(s=>{const filtered=cards.filter(s.filter);const built=filtered.map(buildCard).join('');if(built.trim())html+=`<div class="bsec-lbl">${s.lbl}</div><div class="bgrid">${built}</div>`;});
  document.getElementById('bwrap').innerHTML=html;updateDashProgress();
}

function openBinderCardModal(c,setId){
  if(typeof c==='string') c=JSON.parse(c);
  const imgSrc=getBinderImg(c,setId);
  const slots=getSlots(c,setId);const pfx=setId+':';
  const versHTML=slots.map(s=>{
    const key=slotKey(pfx,c.n,s.ver);const isCol=collected.has(key);
    return`<div class="cmc-ver">
      <div class="cmc-dot" style="background:${isCol?VER_COLOR[s.ver]:'transparent'};border:2px solid ${VER_COLOR[s.ver]};border-radius:3px"></div>
      <span style="color:${isCol?VER_COLOR[s.ver]:'var(--muted)'}">${VER_LABEL[s.ver]} — ${s.ver}${s.price?' — R$'+fmtR(s.price):''}</span>
      ${isCol?'<span style="color:var(--teal);font-size:9px;margin-left:auto">✓ COLETADA</span>':''}
    </div>`;
  }).join('');
  document.getElementById('card-modal-content').innerHTML=`
    ${imgSrc?`<img class="cmc-img" src="${imgSrc}" alt="${c.name}" onerror="this.style.display='none'">`:
      `<div style="height:200px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--muted)">${c.name}</div>`}
    <div class="cmc-body">
      <div class="cmc-title">${c.name}</div>
      <div class="cmc-sub">#${c.n} · ${c.type} · ${c.rare}</div>
      <div class="cmc-grid">
        <div class="cmc-item"><label>Preço base</label><span style="color:var(--teal)">${c.price?'R$'+fmtR(c.price):'—'}</span></div>
        <div class="cmc-item"><label>Set</label><span>${setId.toUpperCase()}</span></div>
      </div>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);margin-bottom:8px;letter-spacing:1px">VERSÕES DO MASTER SET</div>
      <div class="cmc-vers" style="flex-direction:column;gap:8px">${versHTML}</div>
    </div>`;
  openModal('card-modal');
}

// MODAIS
function openModal(id){document.getElementById(id).classList.add('open');if(id==='mp')document.getElementById('m-data').value=new Date().toISOString().split('T')[0];}
function closeModal(id){document.getElementById(id).classList.remove('open');}

const rIC={'Dupla Rara (RR)':'🔥','Ilustração Rara (IR)':'⭐','Ilustracao Rara (IR)':'⭐','Ilustração Rara (SAR)':'⭐','Ilustracao Rara (SAR)':'⭐','Rara Ultra (UR)':'💎','Rara (Holo)':'🌟','Incomum (RH)':'🟢','Comum (RH)':'🟢','Promocional':'🎁'};
const rBC={'Dupla Rara (RR)':'br','Ilustração Rara (IR)':'bi','Ilustracao Rara (IR)':'bi','Ilustração Rara (SAR)':'bi','Ilustracao Rara (SAR)':'bi','Rara Ultra (UR)':'bi','Promocional':'bp'};

async function addPurchase(){
  const prod=document.getElementById('m-prod').value.trim();
  const tipo=document.getElementById('m-tipo').value;
  const date=document.getElementById('m-data').value;
  const price=parseFloat(document.getElementById('m-preco').value);
  const boost=parseInt(document.getElementById('m-boost').value)||0;
  const acess=document.getElementById('m-acess').checked;
  if(!prod||isNaN(price)) return;
  const res=await sb.post('purchases',{date,product:prod,tipo,boost,cards:boost*6,price,acessorio:acess});
  if(Array.isArray(res)) purchases.push(...res);
  closeModal('mp');renderGastos();renderDash();
}
async function addCard(){
  const nome=document.getElementById('c-nome').value.trim();
  const num=document.getElementById('c-num').value.trim();
  const rar=document.getElementById('c-rar').value;
  const src=document.getElementById('c-src').value.trim();
  const lote=document.getElementById('c-lote').value.trim();
  const price=parseFloat(document.getElementById('c-val').value)||0;
  if(!nome) return;
  const res=await sb.post('pulled_cards',{name:nome,num,rar,src,lote,icon:rIC[rar]||'🃏',ic:'fp',bc:rBC[rar]||'bx',price,psrc:'Manual'});
  if(Array.isArray(res)) pulledCards.push(...res);
  closeModal('mc');renderCartas();renderDash();
}

// INIT
initParticles();
(async()=>{await fetchCambio();await loadAll();})();
