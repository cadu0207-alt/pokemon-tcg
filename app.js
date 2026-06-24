// ============================================================
// Pokémon TCG Dashboard — app.js
// Supabase + Scrydex images + pokemontcg.io prices + frankfurter FX
// ============================================================

// ── CONFIG ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_f4d1JHAzTWPWYAI0Vm6aRA_NwM-uzr3';

// ── SUPABASE CLIENT (sem lib externa) ────────────────────────
const sb = {
  headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
  async get(table, params='') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: this.headers });
    return r.json();
  },
  async post(table, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:'POST', headers: this.headers, body: JSON.stringify(body) });
    return r.json();
  },
  async del(table, filter) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method:'DELETE', headers: this.headers });
  },
  async upsert(table, body) {
    const h = {...this.headers, 'Prefer': 'resolution=merge-duplicates,return=representation'};
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:'POST', headers: h, body: JSON.stringify(body) });
    return r.json();
  }
};

// ── IMAGENS — Scrydex (CORS aberto, sem autenticação) ────────
function imgMe04(n) { return `https://images.scrydex.com/pokemon/me4-${parseInt(n)}/large`; }
function imgMe02(n) { return `https://images.scrydex.com/pokemon/me2-${parseInt(n)}/large`; }
function imgMeg(n)  { return `https://images.scrydex.com/pokemon/me1-${parseInt(n)}/large`; }

// ── CÂMBIO USD → BRL (frankfurter.app, gratuito, sem chave) ──
let USD_BRL = 5.70; // fallback
async function fetchCambio() {
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL');
    const d = await r.json();
    USD_BRL = d.rates.BRL;
    document.getElementById('usd-brl').textContent = `USD/BRL: R$${USD_BRL.toFixed(2)}`;
  } catch(e) { console.warn('Câmbio fallback:', USD_BRL); }
}

// ── ESTADO (vem do Supabase) ──────────────────────────────────
let purchases = [];
let pulledCards = [];
let collected = new Set(); // slot_keys

// ── VERSÕES MASTER SET ────────────────────────────────────────
const VER_COLOR = { N:'#c8cfe8', F:'#118ab2', RH:'#06d6a0', SP:'#ff6b35' };
const VER_LABEL = { N:'N', F:'F', RH:'RH', SP:'★' };

function getSlots(c, setId) {
  const r = c.rare || '';
  if (!c.base) return [{ ver:'SP', price:c.price }];
  if (r.includes('Dupla') || r.includes('RR')) return [{ ver:'F', price:c.price }];
  if (r === 'Rara' || r.startsWith('Rara ')) return [
    { ver:'N',  price: c.price },
    { ver:'F',  price: c.priceF  || (c.price ? +(c.price * 1.5).toFixed(2) : null) },
    { ver:'RH', price: c.priceRH || (c.price ? +(c.price * 1.2).toFixed(2) : null) },
  ];
  return [
    { ver:'N',  price: c.price },
    { ver:'RH', price: c.priceRH || (c.price ? +(c.price * 1.2).toFixed(2) : null) },
  ];
}

function slotKey(pfx, n, ver) { return `${pfx}${n}:${ver}`; }

// ── CARREGAR DADOS DO SUPABASE ────────────────────────────────
async function loadAll() {
  setStatus('Carregando...', 'warning');
  try {
    const [p, c, col] = await Promise.all([
      sb.get('purchases', 'order=date.asc'),
      sb.get('pulled_cards', 'order=id.asc'),
      sb.get('collection', 'select=slot_key'),
    ]);
    purchases  = Array.isArray(p) ? p : [];
    pulledCards = Array.isArray(c) ? c : [];
    collected  = new Set((Array.isArray(col) ? col : []).map(r => r.slot_key));
    setStatus('Online ✓', 'ok');
    renderAll();
  } catch(e) {
    setStatus('Erro de conexão', 'error');
    console.error(e);
  }
}

function setStatus(txt, state) {
  document.getElementById('status-txt').textContent = txt;
  const dot = document.getElementById('status-dot');
  dot.className = `dot dot-${state}`;
}

// ── TOGGLE SLOT (marcar/desmarcar versão da carta) ────────────
async function toggleSlot(key) {
  if (collected.has(key)) {
    collected.delete(key);
    await sb.del('collection', `slot_key=eq.${encodeURIComponent(key)}`);
  } else {
    collected.add(key);
    await sb.upsert('collection', { slot_key: key });
  }
  renderBinder();
  updateDashProgress();
}

// ── ABAS ──────────────────────────────────────────────────────
function go(id, el) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  el.classList.add('active');
  if (id === 'fichario') renderBinder();
  if (id === 'dash') updateDashProgress();
}

// ── RENDER TUDO ────────────────────────────────────────────────
function renderAll() {
  renderDash();
  renderGastos();
  renderCartas();
  updateDashProgress();
}

// ── UTILITÁRIOS ───────────────────────────────────────────────
function fmtR(v) { return (+v || 0).toFixed(2).replace('.', ','); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setW(id, w) { const el = document.getElementById(id); if (el) el.style.width = w; }

function kpiHTML(cls, label, value, sub) {
  return `<div class="kpi ${cls}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

function barHTML(label, value, max, color, text) {
  const w = max > 0 ? Math.round(value / max * 100) : 0;
  return `<div class="brow"><div class="blbl">${label}</div><div class="btrack"><div class="bfill" style="width:${w}%;background:${color}">${text}</div></div></div>`;
}

// ── DASHBOARD ─────────────────────────────────────────────────
function renderDash() {
  const invested = purchases.reduce((s,p) => s+Number(p.price), 0);
  const boosters = purchases.filter(p=>!p.acessorio).reduce((s,p) => s+p.boost, 0);
  const pullVal  = pulledCards.reduce((s,c) => s+Number(c.price||0), 0);
  const roi      = invested > 0 ? (pullVal/invested*100).toFixed(0) : 0;
  const apb      = boosters > 0 ? (purchases.filter(p=>!p.acessorio).reduce((s,p)=>s+Number(p.price),0)/boosters).toFixed(2) : '0,00';

  document.getElementById('kpi-dash').innerHTML =
    kpiHTML('red','💰 Total Investido','R$'+fmtR(invested), purchases.length+' compras') +
    kpiHTML('orange','📦 Boosters',''+boosters, '~'+(boosters*6)+' cartas') +
    kpiHTML('gold','💵 R$/Booster','R$'+apb.replace('.',','),'média ponderada') +
    kpiHTML('teal','💎 Valor Pull','R$'+fmtR(pullVal), pulledCards.length+' cartas') +
    kpiHTML('blue','📊 Retorno',roi+'%','valor tirado ÷ gasto');

  // Gráfico raridades
  const rarCount = {};
  pulledCards.forEach(c => {
    const raw = c.rar||'';
    let k = 'Outro';
    if(raw.includes('SAR')) k='SAR';
    else if(raw.includes('RR')||raw.includes('Dupla')) k='Dupla Rara';
    else if(raw.includes('UR')) k='Rara Ultra';
    else if(raw.includes('IR')||raw.includes('Ilustr')) k='Ilustr. Rara';
    else if(raw.includes('Promo')) k='Promo';
    else if(raw.includes('Holo')&&raw.includes('Rara')) k='Rara Holo';
    else if(raw.includes('RH')) k='Reverse Holo';
    rarCount[k] = (rarCount[k]||0)+1;
  });
  const rarColors = {'SAR':'var(--gold)','Dupla Rara':'var(--accent)','Rara Ultra':'#9C27B0','Ilustr. Rara':'var(--blue)','Promo':'var(--teal)','Rara Holo':'#FF9800','Reverse Holo':'var(--teal)'};
  const rarMax = Math.max(...Object.values(rarCount),1);
  document.getElementById('chart-rarity').innerHTML = Object.entries(rarCount)
    .sort((a,b)=>b[1]-a[1])
    .map(([k,v]) => barHTML(k, v, rarMax, rarColors[k]||'var(--muted)', ''+v))
    .join('') || '<div style="color:var(--muted);font-size:12px">Sem cartas ainda</div>';

  // Gráfico gastos por data
  const byDate = {};
  purchases.forEach(p => { byDate[p.date] = (byDate[p.date]||0)+Number(p.price); });
  const dateMax = Math.max(...Object.values(byDate),1);
  document.getElementById('chart-gastos').innerHTML = Object.entries(byDate)
    .map(([d,v]) => barHTML(d.slice(5), v, dateMax, 'linear-gradient(90deg,var(--accent),var(--accent2))', 'R$'+fmtR(v)))
    .join('');

  // Highlights top 6
  const rl = {'Dupla Rara (RR)':'RR','Ilustração Rara (SAR)':'SAR','Ilustração Rara (IR)':'IR','Rara Ultra (UR)':'UR','Rara (Holo)':'HOLO','Incomum (RH)':'RH','Comum (RH)':'RH','Promocional':'PROMO'};
  const top = [...pulledCards].sort((a,b)=>(b.price||0)-(a.price||0)).slice(0,6);
  document.getElementById('dash-highlights').innerHTML = top.map(c =>
    `<div class="pc"><div class="pc-icon ${c.ic||'fp'}">${c.icon||'🃏'}</div>
    <div class="pc-info"><div class="pc-name">${c.name}</div><div class="pc-meta">${c.num||''}</div><div class="pc-src">${c.lote||''}</div></div>
    <div class="pc-right"><span class="rb ${c.bc||'bx'}">${rl[c.rar]||c.rar?.split(' ')[0]||''}</span>
    ${c.price?`<div class="pc-price">R$${fmtR(c.price)}</div>`:''}</div></div>`
  ).join('');
}

// ── PROGRESS MASTER SET ───────────────────────────────────────
const SET_META = {
  me04: { cards: null, label:'🔥 ME04 — Caos Ascendente', color:'var(--accent)', chase:'Mega Greninja ex Gold — R$1.482', totalBase:86, totalSec:36 },
  me02: { cards: null, label:'👻 ME02 — Fogo Fantasmagórico', color:'#9C27B0', chase:'Mega Charizard X ex SAR — R$1.809', totalBase:94, totalSec:36 },
  meg:  { cards: null, label:'🌿 MEG — Megaevolução', color:'#4CAF50', chase:'Mega Greninja ex UR — R$60', totalBase:132, totalSec:56 },
};

function countSlotsFor(cards, pfx) {
  let total=0, col=0;
  cards.forEach(c => {
    const slots = getSlots(c, pfx);
    slots.forEach(s => { total++; if(collected.has(slotKey(pfx+':', c.n, s.ver))) col++; });
  });
  return {total, col};
}

function updateDashProgress() {
  SET_META.me04.cards = CARDS;
  SET_META.me02.cards = CARDS_ME02;
  SET_META.meg.cards  = CARDS_MEG;

  let grandTotal=0, grandCol=0;
  const html = Object.entries(SET_META).map(([id, meta]) => {
    const base  = countSlotsFor(meta.cards.filter(c=>c.base),  id);
    const sec   = countSlotsFor(meta.cards.filter(c=>!c.base), id);
    const total = base.total + sec.total;
    const col   = base.col   + sec.col;
    grandTotal += total; grandCol += col;
    const pct = total>0 ? (col/total*100).toFixed(0) : 0;
    return `<div class="panel" style="border-color:${meta.color}44">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="flex:1"><div style="font-weight:700;font-size:13px">${meta.label}</div>
        <div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace">${total} slots · master set</div></div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:30px;color:${meta.color};line-height:1">${pct}%</div>
      </div>
      <div class="prog"><div class="prog-lbl"><span>Base</span><span>${base.col}/${base.total}</span></div>
        <div class="prog-t"><div class="prog-f" style="width:${base.total>0?(base.col/base.total*100).toFixed(1):0}%;background:${meta.color}"></div></div></div>
      <div class="prog" style="margin:0"><div class="prog-lbl"><span>Secretas</span><span>${sec.col}/${sec.total}</span></div>
        <div class="prog-t"><div class="prog-f" style="width:${sec.total>0?(sec.col/sec.total*100).toFixed(1):0}%;background:${meta.color}88"></div></div></div>
      <div style="margin-top:10px;font-size:10px;font-family:'Space Mono',monospace;color:var(--muted)">Chase: <span style="color:${meta.color}">${meta.chase}</span></div>
    </div>`;
  }).join('');
  document.getElementById('progress-sets').innerHTML = html;

  // Stats globais do fichário
  const pct = grandTotal>0 ? (grandCol/grandTotal*100).toFixed(1) : 0;
  const imp = [...(CARDS||[]),...(CARDS_ME02||[]),...(CARDS_MEG||[])].filter(c=>c.important).length;
  document.getElementById('binder-stats').innerHTML = `
    <div><div class="bsv" style="color:var(--teal)">${grandCol}</div><div class="bsl">Slots Coletados</div></div>
    <div><div class="bsv" style="color:var(--gold)">${imp}</div><div class="bsl">Importantes</div></div>
    <div><div class="bsv" style="color:var(--muted)">${grandTotal}</div><div class="bsl">Total Slots</div></div>
    <div style="flex:1;min-width:180px">
      <div style="height:6px;background:var(--surface2);border-radius:3px;margin-bottom:5px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:3px"></div></div>
      <div class="bsl"><span style="color:var(--teal)">${pct}%</span> MASTER SET COMPLETO</div>
    </div>`;
}

// ── GASTOS ────────────────────────────────────────────────────
function renderGastos() {
  const total    = purchases.reduce((s,p) => s+Number(p.price), 0);
  const boosters = purchases.filter(p=>!p.acessorio);
  const tb       = boosters.reduce((s,p) => s+p.boost, 0);
  const tc       = boosters.reduce((s,p) => s+p.cards, 0);
  const tgasto   = boosters.reduce((s,p) => s+Number(p.price), 0);
  const pullVal  = pulledCards.reduce((s,c) => s+Number(c.price||0), 0);
  const roi      = total>0 ? (pullVal/total*100).toFixed(0) : 0;
  const apb      = tb>0 ? (tgasto/tb).toFixed(2) : '0,00';
  const apc      = tc>0 ? (tgasto/tc).toFixed(2) : '0,00';

  document.getElementById('gastos-resumo').innerHTML = `<div class="kpi-grid">
    ${kpiHTML('red','💰 Total Investido','R$'+fmtR(total),purchases.length+' compras · '+tb+' boosters')}
    ${kpiHTML('gold','📦 R$/Booster','R$'+apb.replace('.',','),'média ponderada')}
    ${kpiHTML('orange','🃏 R$/Carta','R$'+apc.replace('.',','),'~'+tc+' cartas est.')}
    ${kpiHTML('teal','💎 Valor Tirado','R$'+fmtR(pullVal),pulledCards.length+' cartas')}
    ${kpiHTML('blue','📊 Retorno',roi+'%',pullVal>=total?'✅ acima do gasto':'📉 abaixo do gasto')}
  </div>`;

  document.getElementById('gastos-cards').innerHTML = purchases.map(p => {
    const pb = p.boost>0 ? (Number(p.price)/p.boost).toFixed(2) : null;
    const d  = new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
    return `<div class="panel" style="border-color:rgba(255,255,255,.06)">
      <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span class="pill pt">${p.tipo}</span>
            <span style="font-size:11px;color:var(--muted);font-family:'Space Mono',monospace">${d}</span>
            ${p.acessorio?'<span class="pill" style="background:rgba(107,117,153,.2);color:var(--muted)">ACESSÓRIO</span>':''}
          </div>
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p.product}</div>
          ${p.boost>0?`<div style="font-size:11px;color:var(--muted)">${p.boost} boosters · ~${p.cards} cartas</div>`:''}
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
          <div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--accent);line-height:1">R$${fmtR(p.price)}</div>
            <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;text-transform:uppercase">Pago</div></div>
          ${pb?`<div style="text-align:center"><div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--gold);line-height:1">R$${pb.replace('.',',')}</div>
            <div style="font-size:9px;color:var(--muted);font-family:'Space Mono',monospace;text-transform:uppercase">por Booster</div></div>`:''}
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('tlwrap').innerHTML = purchases.map(p => {
    const d = new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const pb = p.boost>0 ? (Number(p.price)/p.boost).toFixed(2) : null;
    return `<div class="tli">
      <div class="tl-date">${d}</div>
      <div class="tl-desc">${p.product}</div>
      <div class="tl-amt">R$${fmtR(p.price)}${pb?' · <span style="color:var(--gold)">R$'+pb.replace('.',',')+'/booster</span>':''}</div>
    </div>`;
  }).join('');
}

// ── CARTAS TIRADAS ────────────────────────────────────────────
function renderCartas() {
  const total    = pulledCards.reduce((s,c) => s+Number(c.price||0), 0);
  const invested = purchases.reduce((s,p) => s+Number(p.price), 0);
  const roi      = invested>0 ? (total/invested*100).toFixed(0) : 0;

  document.getElementById('cards-hdr').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:22px">
    ${kpiHTML('teal','💎 Valor Pull','R$'+fmtR(total),pulledCards.length+' cartas')}
    ${kpiHTML('gold','📊 % Investimento',roi+'%','de R$'+fmtR(invested))}
    ${kpiHTML('red','🛍️ Investido','R$'+fmtR(invested),purchases.length+' compras')}
    ${kpiHTML('blue','📚 Sets','3','ME04 · ME02 · MEG')}
  </div>`;

  const rl = {'Dupla Rara (RR)':'RR','Ilustração Rara (SAR)':'SAR','Ilustração Rara (IR)':'IR','Rara Ultra (UR)':'UR','Rara (Holo)':'HOLO','Incomum (RH)':'RH','Comum (RH)':'RH','Promocional':'PROMO'};
  const lotes = {};
  pulledCards.forEach(c => { const l=c.lote||'Sem lote'; if(!lotes[l]) lotes[l]=[]; lotes[l].push(c); });

  let html = '';
  Object.entries(lotes).forEach(([lote, cards]) => {
    const lTotal = cards.reduce((s,c) => s+Number(c.price||0), 0);
    html += `<div style="font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;padding:8px 0 6px;border-bottom:1px solid var(--border);margin-bottom:12px;display:flex;justify-content:space-between">
      <span>📦 ${lote}</span><span style="color:var(--teal)">${cards.length} · R$${fmtR(lTotal)}</span></div>
    <div class="pulled-grid">`;
    cards.forEach(c => {
      const mm = (c.pmin&&c.pmax) ? `<div class="pc-minmax">mín <span style="color:var(--teal)">R$${fmtR(c.pmin)}</span> · máx <span style="color:var(--accent)">R$${fmtR(c.pmax)}</span></div>` : '';
      html += `<div class="pc"><div class="pc-icon ${c.ic||'fp'}">${c.icon||'🃏'}</div>
        <div class="pc-info"><div class="pc-name">${c.name}</div><div class="pc-meta">${c.num||''}</div>
        ${c.psrc?`<div class="pc-src">📊 ${c.psrc}</div>`:''}${mm}</div>
        <div class="pc-right"><span class="rb ${c.bc||'bx'}">${rl[c.rar]||c.rar?.split(' ')[0]||''}</span>
        ${c.price?`<div class="pc-price">R$${fmtR(c.price)}</div>`:''}</div></div>`;
    });
    html += '</div>';
  });
  document.getElementById('cards-list').innerHTML = html;
}

// ── FICHÁRIO / MASTER SET ─────────────────────────────────────
let currentSet = 'me04';

function switchSet(id, el) {
  currentSet = id;
  document.querySelectorAll('.ctab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderBinder();
}

function getSetData() {
  if (currentSet==='me02') return { cards:CARDS_ME02, imgFn:imgMe02, label:'ME02 — Fogo Fantasmagórico',
    sections:[{lbl:'📄 Base — 001 a 094',filter:c=>c.base},{lbl:'✨ Secretas — 095 a 130',filter:c=>!c.base}] };
  if (currentSet==='meg')  return { cards:CARDS_MEG, imgFn:imgMeg, label:'MEG — Megaevolução',
    sections:[{lbl:'📄 Base — 001 a 132',filter:c=>c.base},{lbl:'✨ Secretas — 133 a 188',filter:c=>!c.base}] };
  return { cards:CARDS, imgFn:imgMe04, label:'ME04 — Caos Ascendente',
    sections:[{lbl:'📄 Base — 001 a 086',filter:c=>c.base},{lbl:'✨ Secretas — 087 a 122',filter:c=>!c.base}] };
}

function renderBinder() {
  const { cards, imgFn, label, sections } = getSetData();
  const pfx = currentSet;
  const q   = document.getElementById('bsrch').value.toLowerCase();
  const oc  = document.getElementById('fc').checked;
  const om  = document.getElementById('fm').checked;
  const oi  = document.getElementById('fi2').checked;

  let totalSlots=0, colSlots=0;
  cards.forEach(c => { getSlots(c,pfx).forEach(s => {
    totalSlots++;
    if(collected.has(slotKey(pfx+':', c.n, s.ver))) colSlots++;
  });});
  const pct = totalSlots>0 ? (colSlots/totalSlots*100).toFixed(0) : 0;
  const totalBase = pfx==='me04'?86 : pfx==='me02'?94 : 132;

  function cardVisible(c) {
    const term = (c.name+c.n+c.type).toLowerCase();
    if(q && !term.includes(q)) return false;
    const anyCol = getSlots(c,pfx).some(s => collected.has(slotKey(pfx+':', c.n, s.ver)));
    if(oc && !anyCol) return false;
    if(om && anyCol) return false;
    if(oi && !c.important) return false;
    return true;
  }

  function buildCard(c) {
    if(!cardVisible(c)) return '';
    const slots  = getSlots(c, pfx);
    const allCol = slots.every(s => collected.has(slotKey(pfx+':', c.n, s.ver)));
    const anyCol = slots.some(s  => collected.has(slotKey(pfx+':', c.n, s.ver)));
    const numLabel = `${c.n}/${String(totalBase).padStart(3,'0')}`;

    const versBoxes = slots.map(s => {
      const key   = slotKey(pfx+':', c.n, s.ver);
      const isCol = collected.has(key);
      const col   = VER_COLOR[s.ver];
      const lbl   = VER_LABEL[s.ver];
      const priceStr = s.price ? `R$${fmtR(s.price)}` : '';
      return `<div class="vslot${isCol?' vslot-col':''}" onclick="event.stopPropagation();toggleSlot('${key}')" title="${s.ver}${priceStr?' — '+priceStr:''}">
        <div class="vdot" style="background:${isCol?col:'transparent'};border-color:${col};color:${isCol?'#08090d':col}">${isCol?'✓':lbl}</div>
        <div class="vnum">${numLabel}</div>
        ${priceStr?`<div class="vprice">${priceStr}</div>`:''}
      </div>`;
    }).join('');

    // Imagem: tenta carregar via Scrydex, fallback para placeholder
    const imgSrc = c.base ? imgFn(c.n) : imgFn(c.n);
    const filt = allCol ? 'none' : anyCol ? 'none' : 'grayscale(80%) brightness(.7)';

    return `<div class="bc2${allCol?' collected':''}${anyCol&&!allCol?' bc2-partial':''}${c.important?' important':''}" title="${c.name}">
      <div class="bc2-in">
        <img src="${imgSrc}" alt="${c.name}" loading="lazy" style="filter:${filt}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="fb">
          <div class="fb-n">${c.n}</div><div class="fb-name">${c.name}</div>
          <div class="fb-t">${c.type}</div>
          <div class="fb-stripe" style="background:${c.color}"></div>
        </div>
        <div class="vslots">${versBoxes}</div>
      </div>
      <div class="chk">✓</div>
      <div class="tip">
        <div class="tip-n">${c.name}</div>
        <div class="tip-nr">#${c.n} · ${c.type}</div>
        <div class="tip-r">${c.rare}</div>
        ${c.price?`<div class="tip-p">R$${fmtR(c.price)}</div>`:''}
        ${c.important?`<div class="tip-imp">★ Importante</div>`:''}
      </div>
    </div>`;
  }

  const setInfo = `<div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted);margin-bottom:14px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
    <span>${label}</span>
    <span style="color:var(--teal)">${colSlots}/${totalSlots} slots</span>
    <span style="color:var(--gold)">${pct}% master set</span>
    <div style="flex:1;min-width:120px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:2px"></div></div>
  </div>`;

  let html = setInfo;
  sections.forEach(s => {
    const filtered = cards.filter(s.filter);
    const built = filtered.map(buildCard).join('');
    if(built.trim()) html += `<div class="bsec-lbl">${s.lbl}</div><div class="bgrid">${built}</div>`;
  });

  document.getElementById('bwrap').innerHTML = html;
  updateDashProgress();
}

// ── MODAIS ────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if(id==='mp') document.getElementById('m-data').value = new Date().toISOString().split('T')[0];
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

async function addPurchase() {
  const prod  = document.getElementById('m-prod').value.trim();
  const tipo  = document.getElementById('m-tipo').value;
  const date  = document.getElementById('m-data').value;
  const price = parseFloat(document.getElementById('m-preco').value);
  const boost = parseInt(document.getElementById('m-boost').value)||0;
  const acess = document.getElementById('m-acess').checked;
  if(!prod || isNaN(price)) return;
  const row = { date, product:prod, tipo, boost, cards:boost*6, price, acessorio:acess };
  const res = await sb.post('purchases', row);
  if(Array.isArray(res)) purchases.push(...res);
  closeModal('mp');
  renderGastos(); renderDash();
}

const rIC = {'Dupla Rara (RR)':'🔥','Ilustração Rara (IR)':'⭐','Ilustração Rara (SAR)':'⭐','Rara Ultra (UR)':'💎','Rara (Holo)':'🌟','Incomum (RH)':'🟢','Comum (RH)':'🟢','Promocional':'🎁'};
const rBC = {'Dupla Rara (RR)':'br','Ilustração Rara (IR)':'bi','Ilustração Rara (SAR)':'bi','Rara Ultra (UR)':'bi','Promocional':'bp'};

async function addCard() {
  const nome  = document.getElementById('c-nome').value.trim();
  const num   = document.getElementById('c-num').value.trim();
  const rar   = document.getElementById('c-rar').value;
  const src   = document.getElementById('c-src').value.trim();
  const lote  = document.getElementById('c-lote').value.trim();
  const price = parseFloat(document.getElementById('c-val').value)||0;
  if(!nome) return;
  const row = { name:nome, num, rar, src, lote, icon:rIC[rar]||'🃏', ic:'fp', bc:rBC[rar]||'bx', price, psrc:'Manual' };
  const res = await sb.post('pulled_cards', row);
  if(Array.isArray(res)) pulledCards.push(...res);
  closeModal('mc');
  renderCartas(); renderDash();
}

// ── INIT ──────────────────────────────────────────────────────
(async () => {
  await fetchCambio();
  await loadAll();
})();
