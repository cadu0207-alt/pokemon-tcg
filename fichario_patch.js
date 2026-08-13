/**
 * fichario_patch.js — v2 (corrigido)
 *
 * CORREÇÕES APLICADAS:
 *  1. Usa sb REST client do app.js (não sdk .from())
 *  2. Usa `collected` Set do app.js como fonte de verdade
 *  3. Usa `currentSet` do app.js (remove ficCurrentSet duplicado)
 *  4. renderBinder() aponta para #bwrap (era #fic-binder-wrap — não existia)
 *  5. Filtros lidos do DOM diretamente (#bsrch, #fc, #fm, #fi2)
 *  6. setFicView() usa style.display (era classList.toggle('hidden') sem efeito)
 *  7. getSetCards() usa CARDS/CARDS_ME02/CARDS_MEG/CARDS_MEP
 *  8. openSlotModal() usa purchases[] já carregado (não chama sb.from())
 *  9. renderGlobalStats() delega para updateDashProgress() do app.js
 * 10. initFichario() chamado pelo loadAll() do app.js após collected ser carregado
 *
 * DEPENDE DO app.js:
 *   currentSet, collected (Set), purchases[], sb, slotKey(), getSlots(), fmtR()
 *   CARDS, CARDS_ME02, CARDS_MEG, CARDS_MEP (dos arquivos de cartas)
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

/* ─────────────────────────────────────────────
   ESTADO LOCAL (view mode e size)
───────────────────────────────────────────── */
let ficViewMode   = 'grid'; // 'grid' | 'binder'
let ficBinderSize = 3;      // 2, 3 ou 4

// Camada de enriquecimento: qty > 1 e origens (localStorage only)
// A fonte de verdade de "tem/não tem" é o `collected` Set do app.js
let ficCollection = {}; // key → { qty, origins }

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
function initFichario() {
  // Sincroniza ficCollection a partir do collected Set já carregado
  loadCollection();
  // HTML usa inline onclick/oninput — sem necessidade de addEventListener aqui
}

/* ─────────────────────────────────────────────
   CARREGAR COLEÇÃO
   Fonte de verdade: `collectedQty` (Map carregado do Supabase
   pelo loadAll do app.js — colunas quantity/origins de `collection`).
   localStorage (`fic_extras`) só é usado como cache/fallback para
   sessões antigas que ainda não sincronizaram com o banco (ex:
   antes da migração de 13/07/2026 que criou as colunas quantity/origins).
───────────────────────────────────────────── */
function loadCollection() {
  const extras = JSON.parse(localStorage.getItem('fic_extras') || '{}');
  ficCollection = {};
  collected.forEach(key => {
    const dbEntry = (typeof collectedQty !== 'undefined') ? collectedQty.get(key) : null;
    if (dbEntry) {
      ficCollection[key] = { qty: dbEntry.qty || 1, origins: dbEntry.origins || [] };
    } else {
      // fallback: ainda não sincronizado no banco — usa cache local e agenda a migração
      const qty = extras[key]?.qty || 1;
      const origins = extras[key]?.origins || [];
      ficCollection[key] = { qty, origins };
      if (extras[key] && (extras[key].qty > 1 || (extras[key].origins || []).length)) {
        saveSlot(key, qty, origins); // sobe o dado local pro Supabase na próxima chance
      }
    }
  });
}

/* ─────────────────────────────────────────────
   SALVAR SLOT
   Sincroniza com `collected` Set + `collectedQty` Map (app.js) +
   grava quantity/origins na tabela `collection` do Supabase.
   localStorage continua sendo atualizado como cache local.
───────────────────────────────────────────── */
async function saveSlot(key, qty, origins) {
  // CORRIGIDO 30/07/2026 (bug relatado: "marco a carta mas não salva" — num
  // caso testado com SV7/Coroas Estelares, mas a causa não é do set, é
  // genérica) — antes retornava aqui SEM NENHUM aviso quando !uid(). O modal
  // fecha normal (saveSlotModal chama closeSlotModal() de qualquer jeito),
  // dando a impressão de que salvou, mas nada persiste — some ao recarregar
  // a página. Acontece se currentUser ainda não carregou (corrida entre o
  // check de auth e o clique) ou se a sessão expirou no meio do uso.
  if (!uid()) {
    if (typeof setStatus === 'function') setStatus('Faça login pra salvar sua coleção', 'error');
    alert('Não foi possível salvar — parece que você não está logado (ou sua sessão expirou). Faça login de novo e tente marcar a carta.');
    return;
  }
  const wasCollected = collected.has(key);
  const prevEntry = (typeof collectedQty !== 'undefined') ? collectedQty.get(key) : null;
  let error = null;
  if (qty <= 0) {
    if (wasCollected) {
      collected.delete(key);
      if (typeof collectedQty !== 'undefined') collectedQty.delete(key);
      ({ error } = await sbClient.from('collection').delete().eq('slot_key', key).eq('user_id', uid()));
      if (error) {
        collected.add(key);
        if (typeof collectedQty !== 'undefined' && prevEntry) collectedQty.set(key, prevEntry);
      }
    }
    if (!error) delete ficCollection[key];
  } else {
    collected.add(key);
    if (typeof collectedQty !== 'undefined') collectedQty.set(key, { qty, origins: origins || [] });
    // upsert SEMPRE que qty>0 — precisa atualizar quantity/origins mesmo
    // quando o slot já estava marcado (ex: subir de 1 pra 3 cópias)
    ({ error } = await sbClient.from('collection').upsert(
      { slot_key: key, user_id: uid(), quantity: qty, origins: origins || [] },
      { onConflict: 'user_id,slot_key' }
    ));
    if (error) {
      if (!wasCollected) collected.delete(key);
      if (typeof collectedQty !== 'undefined') {
        if (prevEntry) collectedQty.set(key, prevEntry); else collectedQty.delete(key);
      }
    }
    if (!error) ficCollection[key] = { qty, origins };
  }
  if (error) {
    console.error('Erro ao salvar slot do fichário:', error);
    if (typeof setStatus === 'function') setStatus('Erro ao salvar — tente novamente', 'error');
    alert('Não foi possível salvar essa carta no fichário. Verifique sua conexão e tente de novo.');
    return;
  }
  // Cache local (fallback pra quando não houver conexão)
  const extras = JSON.parse(localStorage.getItem('fic_extras') || '{}');
  if (qty <= 0) delete extras[key];
  else extras[key] = { qty, origins };
  localStorage.setItem('fic_extras', JSON.stringify(extras));
}

/* ─────────────────────────────────────────────
   DADOS DO SET (usa variáveis globais dos arquivos de cartas)
───────────────────────────────────────────── */
function getSetCards() {
  // CORRIGIDO: delega para getSetData() do app.js, que cobre TODOS os sets
  // (me03, me05, me06, sv1-sv10 etc). O switch antigo só conhecia me02/meg/mep
  // e caía no "default: return CARDS" (me04) para qualquer outro set — por isso
  // o fichário parecia "não atualizar" ao trocar de coleção.
  if (typeof getSetData === 'function') return getSetData().cards;
  switch (currentSet) {            // fallback caso getSetData() não exista
    case 'me02': return CARDS_ME02;
    case 'meg':  return CARDS_MEG;
    case 'mep':  return CARDS_MEP;
    default:     return CARDS;
  }
}

function getSetLabel() {
  // CORRIGIDO: mesma delegação — evita rótulo/coleção dessincronizados
  if (typeof getSetData === 'function') return getSetData().label;
  return {
    me04: 'ME04 — Caos Ascendente',
    me02: 'ME02 — Fogo Fantasmagórico',
    meg:  'MEG — Megaevolução',
    mep:  'MEP — Parceiros Iniciais',
  }[currentSet] || currentSet.toUpperCase();
}

function imgUrl(n, setId) {
  // CORRIGIDO 29/07/2026: aceita setId opcional (2º parâmetro) — necessário pra
  // fichário personalizado/fixado, que mistura cartas de vários sets ao mesmo
  // tempo e não pode depender só do `currentSet` global. Sem o 2º argumento,
  // comportamento 100% igual a antes (usa currentSet).
  const sid = setId || currentSet;
  // Delega para getBinderImg do app.js quando disponível (cobre todos os sets)
  if (typeof getBinderImg === 'function') {
    return getBinderImg({ n }, sid);
  }
  // Fallback inline (caso app.js ainda não tenha carregado)
  const num = parseInt(n, 10);
  if (sid.startsWith('sv') || sid === 'pgo') {
    const safe = isNaN(num) ? n : num;
    return `https://images.pokemontcg.io/${sid}/${safe}.png`;
  }
  switch (sid) {
    case 'me06': return `https://images.scrydex.com/pokemon/me6-${num}/large`;
    case 'me05': return `https://images.scrydex.com/pokemon/me5-${num}/large`;
    case 'me03': return `https://images.scrydex.com/pokemon/me3-${num}/large`;
    case 'me02': return `https://images.scrydex.com/pokemon/me2-${num}/large`;
    case 'meg':  return `https://images.scrydex.com/pokemon/me1-${num}/large`;
    case 'mep':  return `https://images.scrydex.com/pokemon/mep-${num}/large`;
    default:     return `https://images.scrydex.com/pokemon/me4-${num}/large`;
  }
}

/* ─────────────────────────────────────────────
   SWITCH DE ABAS / VIEW / SIZE
───────────────────────────────────────────── */
function switchFicSet(setId) {
  // Delega para switchSet() do app.js (seta currentSet e chama renderBinder)
  const tab = document.getElementById('fic-tab-' + setId);
  if (typeof switchSet === 'function' && tab) switchSet(setId, tab);
}

function setFicView(mode, onRefresh, ids) {
  // ids opcional: {grid,binder,controls} — permite reusar esta função em toolbars
  // de fichário personalizado/Master Set que têm seus próprios ids de botão
  // (retrocompat: sem 'ids', usa os ids do fichário oficial, comportamento igual a antes)
  ficViewMode = mode;
  const gid = (ids && ids.grid) || 'fic-view-grid';
  const bid = (ids && ids.binder) || 'fic-view-binder';
  const cid = (ids && ids.controls) || 'fic-binder-controls';
  const gBtn = document.getElementById(gid);
  const bBtn = document.getElementById(bid);
  const ctrl = document.getElementById(cid);
  if (gBtn) {
    gBtn.style.background  = mode === 'grid' ? 'var(--accent)' : 'var(--surface)';
    gBtn.style.color       = mode === 'grid' ? '#fff' : 'var(--muted)';
    gBtn.style.borderColor = mode === 'grid' ? 'var(--accent)' : 'var(--border)';
  }
  if (bBtn) {
    bBtn.style.background  = mode === 'binder' ? 'var(--accent)' : 'var(--surface)';
    bBtn.style.color       = mode === 'binder' ? '#fff' : 'var(--muted)';
    bBtn.style.borderColor = mode === 'binder' ? 'var(--accent)' : 'var(--border)';
  }
  // CORRIGIDO: era classList.toggle('hidden') — o elemento usa style="display:none"
  if (ctrl) ctrl.style.display = mode === 'binder' ? 'flex' : 'none';
  if (typeof onRefresh === 'function') onRefresh(); else renderBinder();
}

function setBinderSize(n, onRefresh, ids) {
  ficBinderSize = n;
  const prefix = (ids && ids.sizePrefix) || 'fic-binder-';
  [2, 3, 4].forEach(s => {
    const btn = document.getElementById(prefix + s);
    if (!btn) return;
    btn.style.borderColor = s === n ? 'var(--gold)' : 'var(--border)';
    btn.style.color       = s === n ? 'var(--gold)' : 'var(--muted)';
    btn.style.fontWeight  = s === n ? '700' : '400';
  });
  if (typeof onRefresh === 'function') onRefresh(); else renderBinder();
}

/* ─────────────────────────────────────────────
   RENDER PRINCIPAL
───────────────────────────────────────────── */
function renderBinder() {
  const cards = getSetCards();
  const wrap  = document.getElementById('bwrap'); // CORRIGIDO: era 'fic-binder-wrap'
  if (!wrap) return;

  // CORRIGIDO: ler filtros do DOM (IDs do HTML), não de um objeto ficFilter
  const q  = (document.getElementById('bsrch')?.value || '').toLowerCase();
  const oc = document.getElementById('fc')?.checked  || false;
  const om = document.getElementById('fm')?.checked  || false;
  const oi = document.getElementById('fi2')?.checked || false;

  // Estatísticas do set — usa getSlots() para consistência com app.js
  let totalSlots = 0, colSlots = 0;
  cards.forEach(c => {
    getSlots(c, currentSet).forEach(s => {
      totalSlots++;
      if (collected.has(`${currentSet}:${c.n}:${s.ver}`)) colSlots++;
    });
  });
  const pct = totalSlots ? Math.round(colSlots / totalSlots * 100) : 0;

  // Stats globais (reutiliza app.js)
  updateDashProgress();

  // Label de progresso do set
  const infoEl = document.getElementById('fic-set-info');
  if (infoEl) {
    // Mesma data mostrada na aba Preço Justo (price_updated_at.js, mantido por
    // scripts/update_prices.py) — sets fora do map (SV, legado, mep, me06 ainda
    // sem cards) simplesmente não mostram o selo, sem quebrar nada.
    const priceUpdated = (typeof formatPriceUpdatedAt === 'function' && typeof PRICE_UPDATED_AT !== 'undefined' && PRICE_UPDATED_AT.hasOwnProperty(currentSet))
      ? `<span style="font-size:9px;color:var(--muted)">🗓️ preços atualizados em ${formatPriceUpdatedAt(currentSet)}</span>`
      : '';
    infoEl.innerHTML = `
      <span>${getSetLabel()}</span>
      <span style="color:var(--teal)">${colSlots}/${totalSlots} slots</span>
      <span style="color:var(--gold)">${pct}% completo</span>
      <div style="flex:1;min-width:120px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:2px;transition:width .4s"></div>
      </div>
      ${priceUpdated}
      <span style="font-size:9px;color:var(--muted)">Clique na carta para editar slots</span>`;
  }

  // Filtrar cartas
  const filtered = cards.filter(c => {
    if (q && !(c.name + c.n + (c.type || '')).toLowerCase().includes(q)) return false;
    const slots = getSlots(c, currentSet);
    const hasAny = slots.some(s => collected.has(`${currentSet}:${c.n}:${s.ver}`));
    const hasAll = slots.every(s => collected.has(`${currentSet}:${c.n}:${s.ver}`));
    if (oc && !hasAny) return false;
    // "Só faltantes": mostra a carta se falta QUALQUER versão (Normal/Foil/Reverse Holo),
    // não só quando não tem nenhuma. Antes escondia a carta inteira se tivesse só 1 de 2-3 versões.
    if (om && hasAll) return false;
    if (oi && !c.important) return false;
    return true;
  });

  if (ficViewMode === 'grid') {
    wrap.innerHTML = renderGridView(filtered);
  } else {
    wrap.innerHTML = renderBinderView(filtered);
  }

  // PERF 03/08/2026 (auditoria): delegação de evento no wrapper em vez de um
  // addEventListener POR CARTA (eram ~2.000 listeners no Master Set Nacional a
  // cada render). Comportamento idêntico: os dots de versão continuam usando
  // stopPropagation, então clique em dot não abre o modal — igual a antes.
  if (!wrap._ficDelegated) {
    wrap.addEventListener('click', e => {
      const el = e.target.closest('.fic-card');
      if (!el || !wrap.contains(el)) return;
      // Fichário personalizado (#cb-view-grid, renderizado dentro de #bwrap)
      // tem wiring próprio com cardObj/onSaved — não duplicar o modal aqui.
      if (el.closest('#cb-view-grid')) return;
      openSlotModal(el.dataset.n, el.dataset.ver, el.dataset.setid);
    });
    wrap._ficDelegated = true;
  }
}

/* ─────────────────────────────────────────────
   RENDER — MODO GRADE
───────────────────────────────────────────── */
// CORRIGIDO 29/07/2026 (pedido do Eduardo: fichários fixados devem ter "mesmo
// tamanho, mesmas funções" que os fichários oficiais ME04/ME05/etc): extraído
// de dentro de renderGridView() pra escopo de módulo, recebendo `setId`
// explícito em vez de usar `currentSet` direto — assim pode ser reaproveitado
// por qualquer lista de cartas de QUALQUER set, inclusive fichário personalizado
// (que mistura cartas de vários sets na mesma tela). Chamado por renderGridView
// abaixo (fichário oficial) e por openCustomBinderView em app.js (fichário
// personalizado/fixado) — os dois produzem exatamente o mesmo HTML/CSS agora.
function ficCardHtml(c, setId) {
  const slots  = getSlots(c, setId);
  const vers   = slots.map(s => s.ver);
  const allCol = vers.every(v => collected.has(`${setId}:${c.n}:${v}`));
  const hasAny = vers.some(v  => collected.has(`${setId}:${c.n}:${v}`));
  const isImp  = c.important;

  const imgFilter = allCol ? 'none' : hasAny ? 'saturate(.6) brightness(.75)' : 'grayscale(80%) brightness(.55)';
  const border    = allCol ? '2px solid var(--teal)' : hasAny ? '2px solid var(--blue)' : (isImp ? '2px solid var(--gold)' : '2px solid var(--border)');
  const glow      = allCol ? '0 0 14px rgba(6,214,160,.45)' : hasAny ? '0 0 8px rgba(17,138,178,.3)' : (isImp ? '0 0 8px rgba(255,209,102,.3)' : 'none');

  // CORRIGIDO 30/07/2026 (pedido do Eduardo: "aumentar o tamanho, estão
  // pequenos" + precisa funcionar em QUALQUER fichário, não só o oficial):
  // quadradinhos maiores (14px → 20px numa 2ª rodada, pedido "pode aumentar
  // mais ainda") e cada um leva `data-ver` direto — fmInjectQuickToggleDots()
  // (em fichario_melhorias_23jul.js) não precisa mais recalcular a ordem das
  // versões via getSetCards()/currentSet, só lê o atributo.
  // CORRIGIDO 30/07/2026 (pedido do Eduardo: "no mobile está muito grande,
  // toma muita tela") — tamanho agora usa var(--dotsize) em vez de px fixo,
  // que o style.css encolhe pra 12px no media query mobile (@600px), igual
  // já é feito com --cw/--ch (tamanho do card) pro mesmo breakpoint.
  const dots = vers.map(v => {
    const key = `${setId}:${c.n}:${v}`;
    const qty = ficCollection[key]?.qty || (collected.has(key) ? 1 : 0);
    const vc  = VERSIONS.find(x => x.code === v);
    return `<div data-ver="${v}" style="width:var(--dotsize,20px);height:var(--dotsize,20px);border-radius:5px;
      background:${qty>0?vc.color:'var(--border)'};flex-shrink:0;position:relative;box-shadow:0 1px 3px rgba(0,0,0,.4)"
      title="${v}×${qty} — clique pra marcar/desmarcar 1 cópia">
      ${qty>1?`<span style="position:absolute;top:-6px;right:-6px;font-size:9px;color:${vc.color};font-weight:900;
        text-shadow:0 0 2px rgba(0,0,0,.8)">×${qty}</span>`:''}
    </div>`;
  }).join('');

  return `
  <div class="bc2 fic-card${allCol?' collected':''}${isImp?' important':''}"
       data-n="${c.n}" data-ver="${vers[0]}" data-setid="${setId}"
       style="cursor:pointer;border-radius:7px;transition:transform .2s"
       onmouseover="this.style.transform='scale(1.1) translateY(-4px)'"
       onmouseout="this.style.transform=''">
    <div style="width:var(--cw,90px);height:var(--ch,126px);border-radius:7px;border:${border};
         box-shadow:${glow};position:relative;overflow:hidden;background:#0a0b10">
      <img src="${(typeof imgThumb==='function')?imgThumb(imgUrl(c.n, setId)):imgUrl(c.n, setId)}" alt="${c.name}" loading="lazy" decoding="async"
           style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:${imgFilter}"
           onerror="handleCardImgError(this,'${setId}','${c.n}')">
      <div style="display:none;flex-direction:column;align-items:center;justify-content:center;
           gap:3px;position:absolute;inset:0;padding:5px;text-align:center">
        <div style="font-family:'Space Mono',monospace;font-size:7px;color:var(--muted)">${c.n}</div>
        <div style="font-size:7px;font-weight:700;color:var(--text);line-height:1.2">${c.name}</div>
        <div style="font-size:6px;color:var(--muted)">${c.type||''}</div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${c.color||'#666'}"></div>
      </div>
      <!-- dots de versão (data-dotswrap: marcador estável pra fmInjectQuickToggleDots achar isto sem depender do texto do style) -->
      <div data-dotswrap="1" style="position:absolute;bottom:3px;left:3px;display:flex;gap:4px">${dots}</div>
      <!-- check completo -->
      ${allCol?`<div style="position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;
        background:var(--teal);color:var(--bg);font-size:11px;display:flex;align-items:center;
        justify-content:center;font-weight:900;box-shadow:0 2px 8px rgba(6,214,160,.6)">✓</div>`:''}
      ${isImp&&!hasAny?`<div style="position:absolute;top:3px;right:4px;font-size:11px;color:var(--gold)">★</div>`:''}
    </div>
    <!-- tooltip -->
    <div class="tip" style="position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);
         background:rgba(8,9,13,.96);border:1px solid var(--border);border-radius:6px;padding:8px 11px;
         font-size:11px;white-space:nowrap;opacity:0;pointer-events:none;z-index:100;min-width:140px;
         transition:opacity .15s">
      <div style="font-weight:700;color:var(--text)">${c.name}</div>
      <div style="color:var(--muted);font-family:'Space Mono',monospace;font-size:9px">#${c.n} · ${c.type||''}</div>
      <div style="color:var(--accent2);font-size:9px;margin-top:2px">${c.rare||''}</div>
      ${c.price?`<div style="color:var(--teal);font-size:10px;font-weight:700;margin-top:3px">R$${fmtR(c.price)}</div>`:''}
      <div style="margin-top:4px;display:flex;gap:4px">
        ${vers.map(v => {
          const key = `${setId}:${c.n}:${v}`;
          const qty = ficCollection[key]?.qty || (collected.has(key) ? 1 : 0);
          const vc = VERSIONS.find(x => x.code === v);
          return `<span style="font-size:8px;padding:2px 5px;border-radius:3px;background:${qty>0?vc.bg:'rgba(0,0,0,.3)'};
            color:${qty>0?vc.color:'var(--muted)'};">${v}${qty>1?' ×'+qty:''}</span>`;
        }).join('')}
      </div>
      <div style="font-size:9px;color:var(--muted);margin-top:3px">Clique para editar</div>
    </div>
  </div>`;
}

function renderGridView(cards, setIdOf) {
  const base = cards.filter(c => c.base !== false);
  const sec  = cards.filter(c => c.base === false);
  // setIdOf é opcional — sem ele, comportamento idêntico a antes (currentSet
  // pra toda carta). Fichário personalizado passa uma função que lê o set de
  // origem de cada carta (c._setId), já que mistura cartas de vários sets.
  const sIdOf = setIdOf || (() => currentSet);
  const cardHtml = c => ficCardHtml(c, sIdOf(c));

  let html = '';
  if (base.length) html += `<div class="bsec-lbl">📄 Cartas Base</div><div class="bgrid">${base.map(cardHtml).join('')}</div>`;
  if (sec.length)  html += `<div class="bsec-lbl">✨ Cartas Secretas</div><div class="bgrid">${sec.map(cardHtml).join('')}</div>`;
  if (!base.length && !sec.length) html = `<div style="color:var(--muted);font-size:13px;padding:40px;text-align:center">Nenhuma carta encontrada com esses filtros.</div>`;
  return html;
}

/* ─────────────────────────────────────────────
   RENDER — MODO FICHÁRIO FÍSICO (páginas NxN)
───────────────────────────────────────────── */
// CORRIGIDO 30/07/2026 (pedido do Eduardo: fichários personalizados/Master
// Set também precisam do toggle "Grade/Fichário") — mesmo padrão retrocompatível
// de renderGridView: setIdOf opcional, sem ele usa currentSet pra toda carta
// (comportamento idêntico a antes).
function renderBinderView(cards, setIdOf) {
  const N = ficBinderSize;
  const sIdOf = setIdOf || (() => currentSet);
  const slots = [];
  cards.forEach(c => {
    const setId = sIdOf(c);
    getSlots(c, setId).forEach(s => slots.push({ card: c, ver: s.ver, setId }));
  });

  const slotsPerPage = N * N;
  const pages = [];
  for (let i = 0; i < slots.length; i += slotsPerPage) {
    pages.push(slots.slice(i, i + slotsPerPage));
  }

  const isMob = window.innerWidth <= 600;
  const cellSize = N === 2 ? (isMob ? 130 : 160) : N === 3 ? (isMob ? 96 : 130) : (isMob ? 72 : 90);
  const gap = N === 2 ? (isMob ? 12 : 14) : N === 3 ? (isMob ? 8 : 12) : (isMob ? 6 : 8);

  function slotHtml(slot) {
    if (!slot) return `<div style="width:${cellSize}px;height:${Math.round(cellSize*1.4)}px;
      border:2px dashed var(--border);border-radius:6px;opacity:.3"></div>`;
    const { card: c, ver: v, setId } = slot;
    const key = `${setId}:${c.n}:${v}`;
    const isCollected = collected.has(key);
    const qty = ficCollection[key]?.qty || (isCollected ? 1 : 0);
    const vc  = VERSIONS.find(x => x.code === v);
    const imgFilter  = isCollected ? 'none' : 'grayscale(100%) brightness(.5)';
    const borderColor = isCollected ? vc.color : 'var(--border)';
    const glow       = isCollected ? `0 0 10px ${vc.color}55` : 'none';

    return `
    <div class="fic-card" data-n="${c.n}" data-ver="${v}" data-setid="${setId}"
         style="width:${cellSize}px;cursor:pointer;position:relative;transition:transform .15s"
         onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform=''">
      <div style="width:${cellSize}px;height:${Math.round(cellSize*1.4)}px;border-radius:6px;
           border:2px solid ${borderColor};box-shadow:${glow};background:#0a0b10;overflow:hidden;position:relative">
        <img src="${(typeof imgThumb==='function')?imgThumb(imgUrl(c.n, setId)):imgUrl(c.n, setId)}" alt="${c.name}" loading="lazy" decoding="async"
             style="width:100%;height:100%;object-fit:cover;filter:${imgFilter}"
             onerror="handleCardImgError(this,'${setId}','${c.n}')">
        <div style="display:none;flex-direction:column;align-items:center;justify-content:center;
             gap:2px;position:absolute;inset:0;padding:4px;text-align:center">
          <div style="font-size:${cellSize>90?7:6}px;color:var(--muted);font-family:'Space Mono',monospace">${c.n}</div>
          <div style="font-size:${cellSize>90?7:5}px;font-weight:700;color:var(--text);line-height:1.1">${c.name}</div>
          <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${c.color||'#666'}"></div>
        </div>
        <!-- badge versão -->
        <div style="position:absolute;top:2px;left:2px;font-size:7px;padding:1px 4px;border-radius:3px;
             background:${vc.bg};color:${vc.color};font-family:'Space Mono',monospace;font-weight:700">${v}</div>
        ${qty>1?`<div style="position:absolute;top:2px;right:2px;font-size:8px;font-weight:900;
          color:${vc.color};background:rgba(0,0,0,.7);padding:1px 3px;border-radius:3px">×${qty}</div>`:''}
        ${isCollected?`<div style="position:absolute;bottom:2px;right:2px;width:14px;height:14px;border-radius:50%;
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
      <div style="display:flex;justify-content:center">
        <div style="display:grid;grid-template-columns:repeat(${N},${cellSize}px);gap:${gap}px;
             background:var(--surface);border:1px solid var(--border);border-radius:10px;
             padding:16px">
          ${page.map(slotHtml).join('')}
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ─────────────────────────────────────────────
   MODAL DE SLOT
───────────────────────────────────────────── */
// CORRIGIDO 29/07/2026 (pedido do Eduardo: fichário fixado com as mesmas
// funções do fichário oficial): 3 novos parâmetros opcionais.
//  - setIdOverride: set de origem da carta (fichário personalizado passa
//    c._setId, já que mistura cartas de vários sets — sem isso o modal ia
//    tentar usar `currentSet`, que não corresponde à carta clicada).
//  - cardOverride: objeto da carta já em mãos (fichário personalizado não
//    pode achar a carta via getSetCards(), que só cobre o set ATIVO na aba).
//  - onSaved: callback de re-render pós-salvar (default: renderBinder(), igual
//    a antes — fichário personalizado passa sua própria função de refresh).
// Sem esses argumentos, comportamento 100% igual a antes.
let _ficModalSetId    = null;
let _ficModalCardObj  = null;
let _ficModalOnSaved  = null;
async function openSlotModal(cardN, defaultVer, setIdOverride, cardOverride, onSaved) {
  const setId = setIdOverride || currentSet;
  const card  = cardOverride || getSetCards().find(c => c.n === cardN);
  if (!card) return;
  _ficModalSetId   = setId;
  _ficModalCardObj = card;
  _ficModalOnSaved = onSaved || null;

  const slots = getSlots(card, setId);

  // CORRIGIDO: usa purchases[] já carregado pelo app.js (sem chamada extra ao Supabase)
  const purchaseOptions = [...purchases].map(p =>
    `<option value="${p.product}">${new Date(p.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} — ${p.product.substring(0,40)}</option>`
  ).join('');

  const slotsHtml = slots.map(s => {
    const v     = s.ver;
    const key   = `${setId}:${cardN}:${v}`;
    const entry = ficCollection[key] || { qty: collected.has(key) ? 1 : 0, origins: [] };
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

  // Criar overlay se não existir
  let overlay = document.getElementById('slot-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'slot-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);z-index:2000;display:flex;align-items:center;justify-content:center';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSlotModal(); });
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
  <div class="slot-modal-box">
    <button onclick="closeSlotModal()" style="position:absolute;top:12px;right:12px;background:none;
      border:none;color:var(--muted);font-size:18px;cursor:pointer;z-index:2">✕</button>
    <div class="slot-modal-head">
      <img class="slot-modal-img" src="${imgUrl(cardN, setId)}" alt="${card.name}"
           onerror="handleCardImgError(this,'${setId}','${cardN}')">
      <div class="slot-modal-info">
        <div class="slot-modal-title">${card.name}</div>
        <div class="slot-modal-sub">#${card.n} · ${card.type||''}</div>
        <div class="slot-modal-rare">${card.rare||''}</div>
        ${card.price?`<div class="slot-modal-price">R$${fmtR(card.price)}</div>`:''}
        ${card.important?'<div style="color:var(--gold);font-size:12px;margin-top:4px">★ Carta importante</div>':''}
      </div>
    </div>
    <div id="slot-modal-body">
      <div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--muted);
           text-transform:uppercase;margin-bottom:10px">Versões disponíveis</div>
      ${slotsHtml}
    </div>
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

  // Estado temporário para este modal
  window._ficModalCard = cardN;
  window._ficModalQtys = {};
  window._ficModalOrigins = {};
  slots.forEach(s => {
    const v   = s.ver;
    const key = `${setId}:${cardN}:${v}`;
    const entry = ficCollection[key] || { qty: collected.has(key) ? 1 : 0, origins: [] };
    window._ficModalQtys[v]    = entry.qty;
    window._ficModalOrigins[v] = [...entry.origins];
  });
}

function adjSlotQty(ver, delta) {
  const qty = Math.max(0, (window._ficModalQtys[ver] || 0) + delta);
  window._ficModalQtys[ver] = qty;
  const vc = VERSIONS.find(x => x.code === ver);
  const el = document.getElementById('slot-qty-' + ver);
  if (el) { el.textContent = qty; el.style.color = qty > 0 ? vc.color : 'var(--muted)'; }
  const originBlock = document.getElementById('slot-origins-' + ver);
  if (originBlock) originBlock.style.display = qty > 0 ? '' : 'none';
  const block = document.getElementById('slot-block-' + ver);
  if (block) {
    block.style.background  = qty > 0 ? vc.bg : 'var(--surface2)';
    block.style.borderColor = qty > 0 ? vc.color : 'var(--border)';
  }
}

function addOrigin(ver) {
  const sel = document.getElementById('slot-origin-sel-' + ver);
  if (!sel?.value) return;
  if (!window._ficModalOrigins[ver]) window._ficModalOrigins[ver] = [];
  if (!window._ficModalOrigins[ver].includes(sel.value)) {
    window._ficModalOrigins[ver].push(sel.value);
  }
  sel.value = '';
  const btn = sel.nextElementSibling;
  if (btn) { btn.textContent = '✓ Adicionado'; setTimeout(() => btn.textContent = '+ Adicionar origem', 1500); }
}

async function saveSlotModal(cardN) {
  // CORRIGIDO 29/07/2026: usa o setId/carta guardados por openSlotModal em vez
  // de currentSet/getSetCards() — necessário pro fichário personalizado, cuja
  // carta clicada pode não pertencer ao set atualmente ativo na aba.
  const setId = _ficModalSetId || currentSet;
  const card  = _ficModalCardObj || getSetCards().find(c => c.n === cardN);
  if (!card) return;
  const slots = getSlots(card, setId);

  for (const s of slots) {
    const key     = `${setId}:${cardN}:${s.ver}`;
    const qty     = window._ficModalQtys[s.ver]     || 0;
    const origins = window._ficModalOrigins[s.ver]  || [];
    await saveSlot(key, qty, origins);
  }

  closeSlotModal();
  if (typeof _ficModalOnSaved === 'function') _ficModalOnSaved();
  else renderBinder();
  updateDashProgress();
}

function closeSlotModal() {
  const ov = document.getElementById('slot-modal-overlay');
  if (ov) ov.style.display = 'none';
}

/* ─────────────────────────────────────────────
   STATS GLOBAIS — delega para app.js
───────────────────────────────────────────── */
function renderGlobalStats() {
  updateDashProgress(); // app.js já faz o trabalho correto
}

/* ─────────────────────────────────────────────
   IMPRESSÃO / PDF
───────────────────────────────────────────── */
// CORRIGIDO 29/07/2026 (pedido do Eduardo: "imprimir o pdf" também nos
// fichários personalizados) — 3 parâmetros opcionais, mesma ideia de
// retrocompatibilidade usada em renderGridView/openSlotModal: sem eles,
// comportamento 100% igual a antes (set ativo na aba, currentSet pra toda
// carta). Com eles, imprime QUALQUER lista de cartas de QUALQUER set(s) —
// fichário personalizado passa suas próprias cartas (com _setId cada uma)
// e um resolver de setId por carta.
// NOVO 30/07/2026 (pedido do Eduardo: "seria legal se pudesse escolher quais
// imprimir, por exemplo se escolher visualizar só as faltantes, poder
// imprimir só as faltantes") — lê o MESMO checkbox "Só coletadas"/"Só
// faltantes" que já existe na tela (oficial usa #fc/#fm, personalizado e
// Master Set usam #cb-view-oc/#cb-view-om), sem precisar de UI nova.
function _printOnlyState() {
  const oc = document.getElementById('fc')?.checked ?? document.getElementById('cb-view-oc')?.checked ?? false;
  const om = document.getElementById('fm')?.checked ?? document.getElementById('cb-view-om')?.checked ?? false;
  if (om) return 'missing';
  if (oc) return 'collected';
  return undefined; // sem filtro — imprime tudo, igual sempre foi
}
window._printOnlyState = _printOnlyState;

async function printBinder(cardsOverride, setIdOf, labelOverride, onlyState) {
  const N     = ficBinderSize;
  const cards = cardsOverride || getSetCards();
  const sIdOf = setIdOf || (() => currentSet);
  let slots = [];
  cards.forEach(c => getSlots(c, sIdOf(c)).forEach(s => slots.push({ card: c, ver: s.ver, setId: sIdOf(c) })));

  // Filtra ANTES de paginar — imprime só o que o filtro pede, sem página
  // vazia sobrando pros slots que ficaram de fora.
  if (onlyState === 'missing' || onlyState === 'collected') {
    slots = slots.filter(slot => {
      const key = `${slot.setId}:${slot.card.n}:${slot.ver}`;
      const qty = ficCollection[key]?.qty || (collected.has(key) ? 1 : 0);
      return onlyState === 'missing' ? qty <= 0 : qty > 0;
    });
  }
  if (slots.length === 0) {
    alert('Nenhuma carta encontrada com esse filtro pra imprimir.');
    return;
  }

  const slotsPerPage = N * N;
  const CARD_W_MM = 63, CARD_H_MM = 88, GAP_MM = 3;
  const PAGE_W = N * CARD_W_MM + (N - 1) * GAP_MM + 20;
  const PAGE_H = N * CARD_H_MM + (N - 1) * GAP_MM + 20;

  const popup = window.open('', '_blank');
  if (!popup) { alert('Permita pop-ups para imprimir.'); return; }

  popup.document.write(`<!DOCTYPE html><html><head><title>Fichário ${labelOverride || getSetLabel()}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#fff; font-family:sans-serif; }
    .page { width:${PAGE_W}mm; height:${PAGE_H}mm; display:grid;
      grid-template-columns:repeat(${N},${CARD_W_MM}mm);
      grid-template-rows:repeat(${N},${CARD_H_MM}mm);
      gap:${GAP_MM}mm; padding:10mm; page-break-after:always; break-after:page; }
    .slot { width:${CARD_W_MM}mm; height:${CARD_H_MM}mm; border:0.5px solid #ccc;
      border-radius:3mm; overflow:hidden; position:relative; background:#f5f5f5; }
    .slot img { width:100%; height:100%; object-fit:cover; }
    .slot .empty { display:flex;align-items:center;justify-content:center;height:100%;color:#ccc;font-size:8pt; }
    .slot .badge { position:absolute;top:1mm;left:1mm;font-size:6pt;padding:.5mm 1.5mm;border-radius:1mm;font-weight:bold; }
    .slot .num { position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:5pt;color:#666;background:rgba(255,255,255,.7);padding:.5mm; }
    @media print { html,body{width:${PAGE_W}mm;} .page{page-break-after:always;break-after:page;} .no-print{display:none!important;} }
  </style></head><body>`);

  const onlyLabel = onlyState === 'missing' ? ' · só faltantes' : onlyState === 'collected' ? ' · só coletadas' : '';
  popup.document.write(`<div class="no-print" style="position:fixed;top:10px;right:10px;z-index:999;display:flex;gap:8px">
    <span style="font-size:12px;color:#666;align-self:center">${slots.length} slots${onlyLabel} · ${Math.ceil(slots.length/slotsPerPage)} páginas</span>
    <button onclick="window.print()" style="background:#06d6a0;color:#000;border:none;padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨️ Imprimir</button>
    <button onclick="window.close()" style="background:#1e2436;color:#aaa;border:none;padding:8px 12px;border-radius:6px;cursor:pointer">✕</button>
  </div>`);

  const verColors = { N:'#c8cfe8', F:'#118ab2', RH:'#06d6a0', SP:'#ff6b35' };

  for (let pi = 0; pi < Math.ceil(slots.length / slotsPerPage); pi++) {
    const page = slots.slice(pi * slotsPerPage, (pi + 1) * slotsPerPage);
    while (page.length < slotsPerPage) page.push(null);
    popup.document.write(`<div class="page">`);
    page.forEach(slot => {
      if (!slot) { popup.document.write(`<div class="slot"><div class="empty">vazio</div></div>`); return; }
      const { card: c, ver: v, setId } = slot;
      const key = `${setId}:${c.n}:${v}`;
      const qty = ficCollection[key]?.qty || (collected.has(key) ? 1 : 0);
      const col = verColors[v] || '#999';
      const grayFilter = qty > 0 ? '' : 'filter:grayscale(100%) opacity(0.4);';
      popup.document.write(`
      <div class="slot">
        <img src="${imgUrl(c.n, setId)}" alt="${c.name}" style="${grayFilter}"
             onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=empty>${c.n}<br>${c.name}</div>')">
        <div class="badge" style="background:${col}33;color:${col}">${v}${qty>1?' ×'+qty:''}</div>
        <div class="num">${c.n}</div>
      </div>`);
    });
    popup.document.write(`</div>`);
  }
  popup.document.write(`</body></html>`);
  popup.document.close();
}

/* ─────────────────────────────────────────────
   WRAPPER DE UI
───────────────────────────────────────────── */
function renderFicharioUI() {
  loadCollection();
  renderBinder();
  updateDashProgress();
}

// Expor globalmente
window.initFichario      = initFichario;
window.renderBinder      = renderBinder;
window.switchFicSet      = switchFicSet;
window.setFicView        = setFicView;
window.setBinderSize     = setBinderSize;
window.openSlotModal     = openSlotModal;
window.closeSlotModal    = closeSlotModal;
window.saveSlotModal     = saveSlotModal;
window.adjSlotQty        = adjSlotQty;
window.addOrigin         = addOrigin;
window.printBinder       = printBinder;
window.renderFicharioUI  = renderFicharioUI;
window.renderGlobalStats = renderGlobalStats;
window.loadCollection    = loadCollection;
// CORRIGIDO 29/07/2026: exposto pra fichário personalizado/fixado (app.js)
// poder renderizar cards com a MESMA função/HTML/CSS do fichário oficial.
window.ficCardHtml       = ficCardHtml;
window.renderGridView    = renderGridView;
window.imgUrl            = imgUrl;
// ADICIONADO 30/07/2026: exposto pra fichário personalizado/Master Set poderem
// oferecer o toggle Grade/Fichário físico (renderBinderView já aceita setIdOf
// explícito, então funciona com cartas de múltiplos sets misturados).
window.renderBinderView  = renderBinderView;
