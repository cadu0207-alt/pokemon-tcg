/**
 * fichario_patch.js
 * Substitui/adiciona no app.js as funções do Fichário.
 *
 * DEPENDE de: CARDS_DATA (window.cardsMe04, window.cardsMe02, window.cardsMeg, window.cardsMep)
 *             Supabase client (window.sb)
 *             safeJSON() já definido no app.js
 *
 * COMO INTEGRAR:
 *   1. Cole este arquivo inteiro no final do app.js  (ou importe via <script src="fichario_patch.js">)
 *   2. Remova as funções antigas: renderBinder, toggleSlot, initFichario (se existirem)
 *   3. No DOMContentLoaded, chame: initFichario()
 */

/* ─────────────────────────────────────────────
   CONSTANTES DE VERSÃO
───────────────────────────────────────────── */
const VERSIONS = [
  { code: 'N',  label: 'Normal',       color: '#c8cfe8', bg: 'rgba(200,207,232,.15)' },
  { code: 'F',  label: 'Foil/Holo',   color: '#118ab2', bg: 'rgba(17,138,178,.15)'  },
  { code: 'RH', label: 'Reverse Holo', color: '#06d6a0', bg: 'rgba(6,214,160,.15)'   },
  { code: 'SP', label: 'Especial',     color: '#ff6b35', bg: 'rgba(255,107,53,.15)'  },
];

// Quais versões cada raridade suporta
function allowedVersions(rare) {
  const r = (rare || '').toLowerCase();
  if (r.includes('dupla') || r.includes('rr'))          return ['F'];
  if (r.includes('sar') || r.includes('especial'))      return ['SP'];
  if (r.includes(' ir') || r.includes('ilustr'))        return ['SP'];
  if (r.includes('ur') || r.includes('ultra'))          return ['SP'];
  if (r.includes('gold') || r.includes('hyper'))        return ['SP'];
  if (r.includes('promo'))                              return ['SP'];
  if (r.includes('rara') && !r.includes('incomum'))     return ['N','F','RH'];
  if (r.includes('incomum'))                            return ['N','RH'];
  return ['N','RH']; // comum
}

/* ─────────────────────────────────────────────
   ESTADO DO FICHÁRIO
───────────────────────────────────────────── */
let ficCurrentSet  = 'me04';
let ficViewMode    = 'grid';   // 'grid' | 'binder'
let ficBinderSize  = 3;        // 2, 3 ou 4 (NxN bolsos por página)
let ficFilter      = { search: '', onlyCollected: false, onlyMissing: false, onlyImportant: false };

// Mapa de coleção: chave = "set:num:ver" → { qty: N, origins: ['Compra X', ...] }
let ficCollection  = {};

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
async function initFichario() {
  await loadCollection();
  renderFicharioUI();
  document.getElementById('fic-tab-me04')?.addEventListener('click', () => switchFicSet('me04'));
  document.getElementById('fic-tab-me02')?.addEventListener('click', () => switchFicSet('me02'));
  document.getElementById('fic-tab-meg') ?.addEventListener('click', () => switchFicSet('meg'));
  document.getElementById('fic-tab-mep') ?.addEventListener('click', () => switchFicSet('mep'));
  document.getElementById('fic-search')  ?.addEventListener('input', e => { ficFilter.search = e.target.value.toLowerCase(); renderBinder(); });
  document.getElementById('fic-only-col')?.addEventListener('change', e => { ficFilter.onlyCollected = e.target.checked; renderBinder(); });
  document.getElementById('fic-only-mis')?.addEventListener('change', e => { ficFilter.onlyMissing   = e.target.checked; renderBinder(); });
  document.getElementById('fic-only-imp')?.addEventListener('change', e => { ficFilter.onlyImportant = e.target.checked; renderBinder(); });
  document.getElementById('fic-view-grid')  ?.addEventListener('click', () => setFicView('grid'));
  document.getElementById('fic-view-binder')?.addEventListener('click', () => setFicView('binder'));
  document.getElementById('fic-binder-2')?.addEventListener('click', () => setBinderSize(2));
  document.getElementById('fic-binder-3')?.addEventListener('click', () => setBinderSize(3));
  document.getElementById('fic-binder-4')?.addEventListener('click', () => setBinderSize(4));
  document.getElementById('fic-print')?.addEventListener('click', () => printBinder());
}

/* ─────────────────────────────────────────────
   CARREGAR / SALVAR COLEÇÃO (Supabase)
───────────────────────────────────────────── */
async function loadCollection() {
  try {
    const { data, error } = await window.sb
      .from('collection')
      .select('slot_key, qty, origins');
    if (error) throw error;
    ficCollection = {};
    (data || []).forEach(row => {
      ficCollection[row.slot_key] = {
        qty: row.qty || 1,
        origins: row.origins || [],
      };
    });
  } catch(e) {
    console.warn('Supabase offline — usando localStorage', e);
    ficCollection = JSON.parse(localStorage.getItem('fic_collection') || '{}');
  }
}

async function saveSlot(key, qty, origins) {
  const payload = { slot_key: key, qty, origins };
  try {
    if (qty <= 0) {
      await window.sb.from('collection').delete().eq('slot_key', key);
    } else {
      await window.sb.from('collection').upsert(payload, { onConflict: 'slot_key' });
    }
  } catch(e) {
    console.warn('Supabase offline — salvando em localStorage', e);
  }
  if (qty <= 0) delete ficCollection[key];
  else ficCollection[key] = { qty, origins };
  localStorage.setItem('fic_collection', JSON.stringify(ficCollection));
}

/* ─────────────────────────────────────────────
   DADOS DO SET ATUAL
───────────────────────────────────────────── */
function getSetCards() {
  switch(ficCurrentSet) {
    case 'me02': return window.cardsMe02 || [];
    case 'meg':  return window.cardsMeg  || [];
    case 'mep':  return window.cardsMep  || [];
    default:     return window.cardsMe04 || [];
  }
}

function getSetLabel() {
  return { me04:'ME04 — Caos Ascendente', me02:'ME02 — Fogo Fantasmagórico', meg:'MEG — Megaevolução', mep:'MEP — Parceiros Iniciais' }[ficCurrentSet];
}

function imgUrl(n) {
  const num = parseInt(n, 10);
  switch(ficCurrentSet) {
    case 'me02': return `https://images.scrydex.com/pokemon/me2-${num}/large`;
    case 'meg':  return `https://images.scrydex.com/pokemon/me1-${num}/large`;
    case 'mep':  return `https://images.scrydex.com/pokemon/mep-${num}/large`;
    default:     return `https://images.scrydex.com/pokemon/me4-${num}/large`;
  }
}

/* ─────────────────────────────────────────────
   SWITCH DE ABAS / VIEW
───────────────────────────────────────────── */
function switchFicSet(setId) {
  ficCurrentSet = setId;
  document.querySelectorAll('[id^="fic-tab-"]').forEach(t => t.classList.remove('active'));
  document.getElementById('fic-tab-'+setId)?.classList.add('active');
  renderBinder();
}

function setFicView(mode) {
  ficViewMode = mode;
  document.getElementById('fic-view-grid')?.classList.toggle('active', mode === 'grid');
  document.getElementById('fic-view-binder')?.classList.toggle('active', mode === 'binder');
  document.getElementById('fic-binder-controls')?.classList.toggle('hidden', mode === 'grid');
  renderBinder();
}

function setBinderSize(n) {
  ficBinderSize = n;
  document.querySelectorAll('[id^="fic-binder-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('fic-binder-'+n)?.classList.add('active');
  renderBinder();
}

/* ─────────────────────────────────────────────
   RENDER PRINCIPAL
───────────────────────────────────────────── */
function renderBinder() {
  const cards = getSetCards();
  const wrap  = document.getElementById('fic-binder-wrap');
  if (!wrap) return;

  // Stats do set
  const allSlots   = cards.flatMap(c => allowedVersions(c.rare).map(v => `${ficCurrentSet}:${c.n}:${v}`));
  const colSlots   = allSlots.filter(k => ficCollection[k]?.qty > 0);
  const pct        = allSlots.length ? Math.round(colSlots.length / allSlots.length * 100) : 0;

  // Stats globais
  renderGlobalStats();

  // Label progresso
  const infoEl = document.getElementById('fic-set-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <span>${getSetLabel()}</span>
      <span style="color:var(--teal)">${colSlots.length}/${allSlots.length} slots preenchidos</span>
      <span style="color:var(--gold)">${pct}% completo</span>
      <div style="flex:1;min-width:120px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:2px;transition:width .4s"></div>
      </div>`;
  }

  // Filtrar cartas
  const filtered = cards.filter(c => {
    if (ficFilter.search && !(c.name+c.n+c.type).toLowerCase().includes(ficFilter.search)) return false;
    const vers = allowedVersions(c.rare);
    const hasAny = vers.some(v => (ficCollection[`${ficCurrentSet}:${c.n}:${v}`]?.qty || 0) > 0);
    if (ficFilter.onlyCollected && !hasAny) return false;
    if (ficFilter.onlyMissing   &&  hasAny) return false;
    if (ficFilter.onlyImportant && !c.important) return false;
    return true;
  });

  if (ficViewMode === 'grid') {
    wrap.innerHTML = renderGridView(filtered);
  } else {
    wrap.innerHTML = renderBinderView(filtered);
  }

  // Tooltip hover
  wrap.querySelectorAll('.fic-card').forEach(el => {
    el.addEventListener('click', () => {
      const n   = el.dataset.n;
      const ver = el.dataset.ver;
      openSlotModal(n, ver);
    });
  });
}

/* ─────────────────────────────────────────────
   RENDER — MODO GRADE (atual)
───────────────────────────────────────────── */
function renderGridView(cards) {
  // Agrupa por seção (base / secretas)
  const base = cards.filter(c => c.base !== false);
  const sec  = cards.filter(c => c.base === false);

  function cardHtml(c) {
    const vers    = allowedVersions(c.rare);
    const hasAny  = vers.some(v => (ficCollection[`${ficCurrentSet}:${c.n}:${v}`]?.qty || 0) > 0);
    const isImp   = c.important;
    const imgFilter = hasAny ? 'none' : 'grayscale(100%) brightness(.6)';
    const border    = hasAny ? '2px solid var(--teal)' : (isImp ? '2px solid var(--gold)' : '2px solid var(--border)');
    const glow      = hasAny ? '0 0 14px rgba(6,214,160,.45)' : (isImp ? '0 0 8px rgba(255,209,102,.3)' : 'none');

    // Dots de versão
    const dots = vers.map(v => {
      const slot = ficCollection[`${ficCurrentSet}:${c.n}:${v}`];
      const qty  = slot?.qty || 0;
      const vc   = VERSIONS.find(x => x.code === v);
      return `<div style="width:8px;height:8px;border-radius:50%;background:${qty>0?vc.color:'var(--border)'};
        title="${v}" position:relative;" title="${v}×${qty}">
        ${qty>1?`<span style="position:absolute;top:-4px;right:-4px;font-size:7px;color:${vc.color};font-weight:900">×${qty}</span>`:''}
      </div>`;
    }).join('');

    return `
    <div class="bc2 fic-card${hasAny?' collected':''}${isImp?' important':''}"
         data-n="${c.n}" data-ver="${vers[0]}"
         style="cursor:pointer;border-radius:7px;transition:transform .2s"
         onmouseover="this.style.transform='scale(1.1) translateY(-4px)'"
         onmouseout="this.style.transform=''">
      <div style="width:var(--cw,90px);height:var(--ch,126px);border-radius:7px;border:${border};
           box-shadow:${glow};position:relative;overflow:hidden;background:#0a0b10">
        <img src="${imgUrl(c.n)}" alt="${c.name}" loading="lazy"
             style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${imgFilter}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div style="display:none;flex-direction:column;align-items:center;justify-content:center;
             gap:3px;position:absolute;inset:0;padding:5px;text-align:center">
          <div style="font-family:'Space Mono',monospace;font-size:7px;color:var(--muted)">${c.n}</div>
          <div style="font-size:7px;font-weight:700;color:var(--text);line-height:1.2">${c.name}</div>
          <div style="font-size:6px;color:var(--muted)">${c.type}</div>
          <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${c.color}"></div>
        </div>
        <!-- dots de versão -->
        <div style="position:absolute;bottom:3px;left:3px;display:flex;gap:3px">${dots}</div>
        <!-- check -->
        ${hasAny?`<div style="position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;
          background:var(--teal);color:var(--bg);font-size:11px;display:flex;align-items:center;
          justify-content:center;font-weight:900;box-shadow:0 2px 8px rgba(6,214,160,.6)">✓</div>`:''}
        ${isImp&&!hasAny?`<div style="position:absolute;top:3px;right:4px;font-size:11px;color:var(--gold)">★</div>`:''}
      </div>
      <!-- tooltip -->
      <div class="tip" style="position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);
           background:rgba(8,9,13,.96);border:1px solid var(--border);border-radius:6px;padding:8px 11px;
           font-size:11px;white-space:nowrap;opacity:0;pointer-events:none;z-index:100;min-width:140px;
           transition:opacity .15s" onmouseenter="this.style.opacity=1" >
        <div style="font-weight:700;color:var(--text)">${c.name}</div>
        <div style="color:var(--muted);font-family:'Space Mono',monospace;font-size:9px">#${c.n} · ${c.type}</div>
        <div style="color:var(--accent2);font-size:9px;margin-top:2px">${c.rare}</div>
        ${c.price?`<div style="color:var(--teal);font-size:10px;font-weight:700;margin-top:3px">R$${c.price.toFixed(2).replace('.',',')}</div>`:''}
        <div style="margin-top:4px;display:flex;gap:4px">
          ${vers.map(v => {
            const qty = ficCollection[`${ficCurrentSet}:${c.n}:${v}`]?.qty || 0;
            const vc = VERSIONS.find(x=>x.code===v);
            return `<span style="font-size:8px;padding:2px 5px;border-radius:3px;background:${qty>0?vc.bg:'rgba(0,0,0,.3)'};
              color:${qty>0?vc.color:'var(--muted)'};">${v}${qty>1?' ×'+qty:''}</span>`;
          }).join('')}
        </div>
        <div style="font-size:9px;color:var(--muted);margin-top:3px">Clique para editar</div>
      </div>
    </div>`;
  }

  let html = '';
  if (base.length) {
    html += `<div class="bsec-lbl">📄 Cartas Base</div>
             <div class="bgrid">${base.map(cardHtml).join('')}</div>`;
  }
  if (sec.length) {
    html += `<div class="bsec-lbl">✨ Cartas Secretas</div>
             <div class="bgrid">${sec.map(cardHtml).join('')}</div>`;
  }
  if (!base.length && !sec.length) {
    html = `<div style="color:var(--muted);font-size:13px;padding:40px;text-align:center">Nenhuma carta encontrada com esses filtros.</div>`;
  }
  return html;
}

/* ─────────────────────────────────────────────
   RENDER — MODO FICHÁRIO FÍSICO
   Ordem: por carta → N → F → RH → SP
   Layout: páginas de NxN slots
───────────────────────────────────────────── */
function renderBinderView(cards) {
  const N = ficBinderSize;

  // Gerar lista ordenada de slots: cada carta expande nas suas versões
  const slots = [];
  cards.forEach(c => {
    allowedVersions(c.rare).forEach(v => {
      slots.push({ card: c, ver: v });
    });
  });

  // Dividir em páginas
  const slotsPerPage = N * N;
  const pages = [];
  for (let i = 0; i < slots.length; i += slotsPerPage) {
    pages.push(slots.slice(i, i + slotsPerPage));
  }

  const cellSize = N === 2 ? 130 : N === 3 ? 96 : 72;
  const gap = N === 2 ? 12 : N === 3 ? 8 : 6;

  function slotHtml(slot) {
    if (!slot) return `<div style="width:${cellSize}px;height:${Math.round(cellSize*1.4)}px;
      border:2px dashed var(--border);border-radius:6px;opacity:.3"></div>`;
    const { card: c, ver: v } = slot;
    const key = `${ficCurrentSet}:${c.n}:${v}`;
    const entry = ficCollection[key];
    const qty = entry?.qty || 0;
    const vc = VERSIONS.find(x => x.code === v);
    const collected = qty > 0;
    const imgFilter = collected ? 'none' : 'grayscale(100%) brightness(.5)';
    const borderColor = collected ? vc.color : 'var(--border)';
    const glow = collected ? `0 0 10px ${vc.color}55` : 'none';

    return `
    <div class="fic-card" data-n="${c.n}" data-ver="${v}"
         style="width:${cellSize}px;cursor:pointer;position:relative;transition:transform .15s"
         onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform=''">
      <div style="width:${cellSize}px;height:${Math.round(cellSize*1.4)}px;border-radius:6px;
           border:2px solid ${borderColor};box-shadow:${glow};background:#0a0b10;overflow:hidden;position:relative">
        <img src="${imgUrl(c.n)}" alt="${c.name}" loading="lazy"
             style="width:100%;height:100%;object-fit:cover;filter:${imgFilter}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div style="display:none;flex-direction:column;align-items:center;justify-content:center;
             gap:2px;position:absolute;inset:0;padding:4px;text-align:center">
          <div style="font-size:${cellSize>90?7:6}px;color:var(--muted);font-family:'Space Mono',monospace">${c.n}</div>
          <div style="font-size:${cellSize>90?7:5}px;font-weight:700;color:var(--text);line-height:1.1">${c.name}</div>
          <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${c.color}"></div>
        </div>
        <!-- badge versão -->
        <div style="position:absolute;top:2px;left:2px;font-size:7px;padding:1px 4px;border-radius:3px;
             background:${vc.bg};color:${vc.color};font-family:'Space Mono',monospace;font-weight:700">${v}</div>
        <!-- quantidade -->
        ${qty>1?`<div style="position:absolute;top:2px;right:2px;font-size:8px;font-weight:900;
          color:${vc.color};background:rgba(0,0,0,.7);padding:1px 3px;border-radius:3px">×${qty}</div>`:''}
        ${collected?`<div style="position:absolute;bottom:2px;right:2px;width:14px;height:14px;border-radius:50%;
          background:${vc.color};color:#000;font-size:8px;display:flex;align-items:center;
          justify-content:center;font-weight:900">✓</div>`:''}
      </div>
      <div style="font-size:${cellSize>90?7:6}px;color:var(--muted);text-align:center;margin-top:2px;
           font-family:'Space Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
           width:${cellSize}px">${c.n}</div>
    </div>`;
  }

  if (!pages.length) return `<div style="color:var(--muted);padding:40px;text-align:center">Nenhum slot encontrado.</div>`;

  return pages.map((page, pi) => {
    // Pad até completar o grid
    while (page.length < slotsPerPage) page.push(null);
    return `
    <div style="margin-bottom:32px">
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);
           letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;
           display:flex;align-items:center;gap:10px">
        <span>📖 PÁGINA ${pi+1}</span>
        <span style="color:var(--accent2)">slots ${pi*slotsPerPage+1}–${Math.min((pi+1)*slotsPerPage, slots.length)}</span>
        <div style="flex:1;height:1px;background:var(--border)"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${N},${cellSize}px);gap:${gap}px;
           background:var(--surface);border:1px solid var(--border);border-radius:10px;
           padding:16px;width:fit-content">
        ${page.map(slotHtml).join('')}
      </div>
    </div>`;
  }).join('');
}

/* ─────────────────────────────────────────────
   MODAL DE SLOT — marcar versão, quantidade, origem
───────────────────────────────────────────── */
async function openSlotModal(cardN, defaultVer) {
  const cards  = getSetCards();
  const card   = cards.find(c => c.n === cardN);
  if (!card) return;

  // Carregar compras para lista de origens
  let purchaseOptions = '';
  try {
    const { data } = await window.sb.from('purchases').select('id,product,date').order('date', { ascending: false });
    purchaseOptions = (data||[]).map(p =>
      `<option value="${p.product}">${new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} — ${p.product.substring(0,40)}</option>`
    ).join('');
  } catch(e) {
    purchaseOptions = '<option value="Desconhecida">Desconhecida</option>';
  }

  const vers = allowedVersions(card.rare);

  // Montar slots atuais
  const slotsHtml = vers.map(v => {
    const key   = `${ficCurrentSet}:${cardN}:${v}`;
    const entry = ficCollection[key] || { qty: 0, origins: [] };
    const vc    = VERSIONS.find(x => x.code === v);
    const active = entry.qty > 0;
    return `
    <div id="slot-block-${v}" style="background:${active?vc.bg:'var(--surface2)'};border:1px solid ${active?vc.color:'var(--border)'};
         border-radius:8px;padding:14px;margin-bottom:10px;transition:all .2s">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <span style="color:${vc.color};font-family:'Space Mono',monospace;font-size:11px;font-weight:700">${v}</span>
          <span style="color:var(--muted);font-size:11px;margin-left:6px">${vc.label}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="adjSlotQty('${v}',-1)" style="width:24px;height:24px;border-radius:50%;
            background:var(--surface);border:1px solid var(--border);color:var(--text);cursor:pointer;
            font-size:14px;display:flex;align-items:center;justify-content:center">−</button>
          <span id="slot-qty-${v}" style="font-family:'Bebas Neue',sans-serif;font-size:24px;
            color:${active?vc.color:'var(--muted)'};min-width:24px;text-align:center">${entry.qty}</span>
          <button onclick="adjSlotQty('${v}',+1)" style="width:24px;height:24px;border-radius:50%;
            background:var(--surface);border:1px solid var(--border);color:var(--text);cursor:pointer;
            font-size:14px;display:flex;align-items:center;justify-content:center">+</button>
        </div>
      </div>
      ${entry.origins.length?`<div style="font-size:10px;color:var(--muted);margin-bottom:6px">
        Origens: ${entry.origins.join(', ')}</div>`:''}
      <div id="slot-origins-${v}" style="${entry.qty>0?'':'display:none'}">
        <select id="slot-origin-sel-${v}" style="width:100%;background:var(--surface);border:1px solid var(--border);
          border-radius:5px;padding:6px 8px;color:var(--text);font-size:11px;margin-bottom:4px">
          <option value="">— Selecionar origem —</option>
          ${purchaseOptions}
          <option value="Troca">Troca</option>
          <option value="Presente">Presente</option>
          <option value="Avulso">Avulso (loja)</option>
        </select>
        <button onclick="addOrigin('${v}')" style="font-size:10px;color:var(--teal);background:none;
          border:none;cursor:pointer;font-family:'Space Mono',monospace">+ Adicionar origem</button>
      </div>
    </div>`;
  }).join('');

  // Abrir overlay
  let overlay = document.getElementById('slot-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'slot-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);z-index:2000;display:flex;align-items:center;justify-content:center';
    overlay.addEventListener('click', e => { if(e.target===overlay) closeSlotModal(); });
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;
       padding:24px;width:420px;max-width:92vw;max-height:88vh;overflow-y:auto;position:relative">
    <button onclick="closeSlotModal()" style="position:absolute;top:12px;right:12px;background:none;
      border:none;color:var(--muted);font-size:18px;cursor:pointer">✕</button>

    <!-- Cabeçalho com imagem -->
    <div style="display:flex;gap:14px;margin-bottom:20px;align-items:flex-start">
      <img src="${imgUrl(cardN)}" alt="${card.name}"
           style="width:70px;height:98px;object-fit:cover;border-radius:6px;border:1px solid var(--border)"
           onerror="this.style.display='none'">
      <div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px">${card.name}</div>
        <div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)">#${card.n} · ${card.type}</div>
        <div style="font-size:11px;color:var(--accent2);margin-top:3px">${card.rare}</div>
        ${card.price?`<div style="font-family:'Space Mono',monospace;font-size:13px;color:var(--teal);
          font-weight:700;margin-top:4px">R$${card.price.toFixed(2).replace('.',',')}</div>`:''}
        ${card.important?'<div style="color:var(--gold);font-size:10px;margin-top:3px">★ Carta importante</div>':''}
      </div>
    </div>

    <!-- Slots por versão -->
    <div id="slot-modal-body">
      <div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--muted);
           text-transform:uppercase;margin-bottom:10px">Versões disponíveis</div>
      ${slotsHtml}
    </div>

    <!-- Salvar -->
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <button onclick="closeSlotModal()" style="background:var(--surface2);border:1px solid var(--border);
        color:var(--muted);padding:8px 14px;border-radius:6px;font-family:'Space Mono',monospace;
        font-size:11px;cursor:pointer">Cancelar</button>
      <button onclick="saveSlotModal('${cardN}')" style="background:var(--teal);color:var(--bg);
        border:none;padding:9px 18px;border-radius:6px;font-family:'Space Mono',monospace;
        font-size:11px;font-weight:700;cursor:pointer">Salvar</button>
    </div>
  </div>`;

  overlay.style.display = 'flex';

  // Guardar estado temporário de quantidades
  window._ficModalCard = cardN;
  window._ficModalQtys = {};
  window._ficModalOrigins = {};
  vers.forEach(v => {
    const key = `${ficCurrentSet}:${cardN}:${v}`;
    const entry = ficCollection[key] || { qty: 0, origins: [] };
    window._ficModalQtys[v]    = entry.qty;
    window._ficModalOrigins[v] = [...entry.origins];
  });
}

function adjSlotQty(ver, delta) {
  const cur = (window._ficModalQtys[ver] || 0) + delta;
  const qty = Math.max(0, cur);
  window._ficModalQtys[ver] = qty;
  const vc = VERSIONS.find(x => x.code === ver);
  const el = document.getElementById('slot-qty-'+ver);
  if (el) { el.textContent = qty; el.style.color = qty > 0 ? vc.color : 'var(--muted)'; }
  const originBlock = document.getElementById('slot-origins-'+ver);
  if (originBlock) originBlock.style.display = qty > 0 ? '' : 'none';
  const block = document.getElementById('slot-block-'+ver);
  if (block) {
    block.style.background = qty > 0 ? vc.bg : 'var(--surface2)';
    block.style.borderColor = qty > 0 ? vc.color : 'var(--border)';
  }
}

function addOrigin(ver) {
  const sel = document.getElementById('slot-origin-sel-'+ver);
  if (!sel?.value) return;
  if (!window._ficModalOrigins[ver]) window._ficModalOrigins[ver] = [];
  if (!window._ficModalOrigins[ver].includes(sel.value)) {
    window._ficModalOrigins[ver].push(sel.value);
  }
  sel.value = '';
  // Mostrar feedback
  const btn = sel.nextElementSibling;
  if (btn) { btn.textContent = '✓ Adicionado'; setTimeout(() => btn.textContent = '+ Adicionar origem', 1500); }
}

async function saveSlotModal(cardN) {
  const cards = getSetCards();
  const card  = cards.find(c => c.n === cardN);
  if (!card) return;
  const vers = allowedVersions(card.rare);

  for (const v of vers) {
    const key = `${ficCurrentSet}:${cardN}:${v}`;
    const qty = window._ficModalQtys[v] || 0;
    const origins = window._ficModalOrigins[v] || [];
    await saveSlot(key, qty, origins);
  }

  closeSlotModal();
  renderBinder();
  renderGlobalStats();
}

function closeSlotModal() {
  const ov = document.getElementById('slot-modal-overlay');
  if (ov) ov.style.display = 'none';
}

/* ─────────────────────────────────────────────
   STATS GLOBAIS DO FICHÁRIO
───────────────────────────────────────────── */
function renderGlobalStats() {
  const allCards = [
    ...(window.cardsMe04||[]).map(c=>({...c,set:'me04'})),
    ...(window.cardsMe02||[]).map(c=>({...c,set:'me02'})),
    ...(window.cardsMeg ||[]).map(c=>({...c,set:'meg'})),
    ...(window.cardsMep ||[]).map(c=>({...c,set:'mep'})),
  ];

  let totalSlots = 0, colSlots = 0, impCards = 0;
  allCards.forEach(c => {
    const vers = allowedVersions(c.rare);
    vers.forEach(v => {
      totalSlots++;
      if ((ficCollection[`${c.set}:${c.n}:${v}`]?.qty || 0) > 0) colSlots++;
    });
    if (c.important) impCards++;
  });

  const pct = totalSlots ? (colSlots / totalSlots * 100).toFixed(1) : 0;
  setText('bs-col', colSlots);
  setText('bs-tot', totalSlots);
  setText('bs-imp', impCards);
  setText('bs-pct', pct + '%');
  const bar = document.getElementById('bs-bar');
  if (bar) bar.style.width = pct + '%';
}

function setText(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }

/* ─────────────────────────────────────────────
   IMPRESSÃO / PDF
   Usa window.print() com CSS @media print embutido
   (print_binder.js tem versão completa com html2canvas+jsPDF)
───────────────────────────────────────────── */
async function printBinder() {
  const N     = ficBinderSize;
  const cards = getSetCards();
  const slots = [];
  cards.forEach(c => allowedVersions(c.rare).forEach(v => slots.push({ card: c, ver: v })));

  const slotsPerPage = N * N;
  const CARD_W_MM = 63, CARD_H_MM = 88;
  const GAP_MM = 3;
  const PAGE_W = N * CARD_W_MM + (N - 1) * GAP_MM + 20;
  const PAGE_H = N * CARD_H_MM + (N - 1) * GAP_MM + 20;

  // Pré-carregar imagens como base64
  const popup = window.open('', '_blank');
  popup.document.write(`<!DOCTYPE html><html><head><title>Fichário ${getSetLabel()}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#fff; font-family: sans-serif; }
    .page {
      width:${PAGE_W}mm; height:${PAGE_H}mm;
      display:grid; grid-template-columns:repeat(${N},${CARD_W_MM}mm);
      grid-template-rows:repeat(${N},${CARD_H_MM}mm);
      gap:${GAP_MM}mm; padding:10mm;
      page-break-after:always; break-after:page;
    }
    .slot {
      width:${CARD_W_MM}mm; height:${CARD_H_MM}mm;
      border:0.5px solid #ccc; border-radius:3mm;
      overflow:hidden; position:relative; background:#f5f5f5;
    }
    .slot img { width:100%; height:100%; object-fit:cover; }
    .slot .empty { display:flex;align-items:center;justify-content:center;height:100%;color:#ccc;font-size:8pt; }
    .slot .badge {
      position:absolute;top:1mm;left:1mm;font-size:6pt;
      padding:0.5mm 1.5mm;border-radius:1mm;font-weight:bold;
    }
    .slot .num { position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:5pt;color:#666;background:rgba(255,255,255,.7);padding:0.5mm; }
    @media print {
      html,body{width:${PAGE_W}mm;}
      .page{page-break-after:always;break-after:page;}
      .no-print{display:none!important;}
    }
  </style></head><body>`);

  // Botão de impressão
  popup.document.write(`<div class="no-print" style="position:fixed;top:10px;right:10px;z-index:999;display:flex;gap:8px">
    <span style="font-size:12px;color:#666;align-self:center">${slots.length} slots · ${Math.ceil(slots.length/slotsPerPage)} páginas</span>
    <button onclick="window.print()" style="background:#06d6a0;color:#000;border:none;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨️ Imprimir</button>
    <button onclick="window.close()" style="background:#1e2436;color:#aaa;border:none;padding:8px 12px;border-radius:6px;cursor:pointer">✕</button>
  </div>`);

  const verColors = { N:'#c8cfe8', F:'#118ab2', RH:'#06d6a0', SP:'#ff6b35' };

  for (let pi = 0; pi < Math.ceil(slots.length / slotsPerPage); pi++) {
    const page = slots.slice(pi * slotsPerPage, (pi + 1) * slotsPerPage);
    while (page.length < slotsPerPage) page.push(null);

    popup.document.write(`<div class="page">`);
    page.forEach(slot => {
      if (!slot) {
        popup.document.write(`<div class="slot"><div class="empty">vazio</div></div>`);
        return;
      }
      const { card: c, ver: v } = slot;
      const key = `${ficCurrentSet}:${c.n}:${v}`;
      const qty = ficCollection[key]?.qty || 0;
      const col = verColors[v] || '#999';
      const grayFilter = qty > 0 ? '' : 'filter:grayscale(100%) opacity(0.4);';
      popup.document.write(`
      <div class="slot">
        <img src="${imgUrl(c.n)}" alt="${c.name}" style="${grayFilter}"
             onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=empty>${c.n}<br>${c.name}</div>')">
        <div class="badge" style="background:${col}33;color:${col}">${v}${qty>1?' ×'+qty:''}</div>
        <div class="num">${c.n}</div>
      </div>`);
    });
    popup.document.write(`</div>`); // .page
  }

  popup.document.write(`</body></html>`);
  popup.document.close();
}

/* ─────────────────────────────────────────────
   RENDER UI WRAPPER (chamado ao mudar para a aba)
───────────────────────────────────────────── */
function renderFicharioUI() {
  renderGlobalStats();
  renderBinder();
}

// Expor globalmente
window.initFichario    = initFichario;
window.renderBinder    = renderBinder;
window.switchFicSet    = switchFicSet;
window.setFicView      = setFicView;
window.setBinderSize   = setBinderSize;
window.openSlotModal   = openSlotModal;
window.closeSlotModal  = closeSlotModal;
window.saveSlotModal   = saveSlotModal;
window.adjSlotQty      = adjSlotQty;
window.addOrigin       = addOrigin;
window.printBinder     = printBinder;
window.renderFicharioUI = renderFicharioUI;
