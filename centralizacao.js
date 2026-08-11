// ================================================================
// MyDeck — Aba Avaliação de Centralização (centralizacao.js)
// Ferramenta pré-graduação: o usuário fotografa a carta sobre fundo
// branco, carrega a imagem, e ajusta 8 pontos (2 retângulos — um
// externo na borda física da carta, um interno na borda impressa —
// 4 lados cada) até as bordas correspondentes. A partir da diferença
// entre borda externa e interna em cada lado calculamos a razão de
// centralização (ex: 60/40) nos eixos esquerda/direita e topo/base,
// e estimamos o teto de nota em PSA, BGS e CGC — os 3 principais
// graduadores — com base nos padrões públicos de cada empresa.
//
// IMPORTANTE: a imagem é processada 100% no navegador (FileReader +
// posicionamento via CSS). Nada é enviado nem salvo no Supabase —
// é só uma ferramenta local de apoio, como pedido pelo Eduardo.
// Centralização é só 1 dos 4 critérios de grade (corners, edges,
// surface também entram) — por isso tratamos o resultado como TETO
// possível pela centralização, nunca como nota final garantida.
// ================================================================

const CENT = {
  dataUrl: null,
  edges: null,       // {outer:{l,r,t,b}, inner:{l,r,t,b}} — frações 0..1
  dragging: null,    // {rect:'outer'|'inner', side:'l'|'r'|'t'|'b'}
  listenersBound: false
};

function centDefaultEdges() {
  return {
    outer: { l: 0.03, r: 0.97, t: 0.03, b: 0.97 },
    inner: { l: 0.10, r: 0.90, t: 0.10, b: 0.90 }
  };
}

// ── TABELAS DE PADRÃO DE CENTRALIZAÇÃO (frente) ──────────────────
// Cada item é [percentual máximo do lado maior, nota-teto]. Fontes:
// PSA (55/45 pro 10 desde a mudança de padrão em 2025, 60/40 pro 9),
// BGS (Black Label/Pristine exige 50/50 literal), CGC (50/50 pro
// Pristine 10). São estimativas educadas a partir dos padrões
// públicos — cada empresa pode variar um pouco no julgamento final,
// e a nota real também depende de corners/edges/surface.
const CENT_BREAKS = {
  PSA: [
    [50, '10 (perfeita)'], [55, '10'], [60, '9'], [65, '8.5'],
    [70, '8'], [75, '7'], [80, '6'], [85, '5'], [90, '4'], [100, '≤ 3']
  ],
  BGS: [
    [50, '10 · Pristine/Black Label*'], [55, '9.5'], [60, '9'], [65, '8.5'],
    [70, '8'], [75, '7.5'], [80, '7'], [85, '6'], [90, '5'], [100, '≤ 4']
  ],
  CGC: [
    [50, '10 · Pristine'], [55, '9.5'], [65, '9'], [70, '8.5'],
    [75, '8'], [80, '7.5'], [85, '7'], [90, '6'], [100, '≤ 5']
  ]
};

function centGradeFromBreaks(company, pctBig) {
  const breaks = CENT_BREAKS[company];
  for (const [max, label] of breaks) {
    if (pctBig <= max) return label;
  }
  return breaks[breaks.length - 1][1];
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────────
function renderCentralizacao() {
  const holder = document.getElementById('centralizacao-wrap');
  if (!holder) return;

  if (!CENT.dataUrl) {
    holder.innerHTML = centUploadScreenHTML();
    return;
  }
  centRenderTool(holder);
}

function centUploadScreenHTML() {
  return `
    <div class="sec-title" style="margin:0 0 6px">🎯 Avaliação de Centralização (pré-graduação)</div>
    <div class="mkt-note" style="margin-bottom:20px">
      Ferramenta pra estimar sua nota de <b>centralização</b> antes de mandar a carta pra graduação (PSA, BGS, CGC).
      A imagem é processada só no seu navegador — <b>não é enviada nem salva</b> em lugar nenhum. Centralização é
      apenas 1 dos 4 critérios de nota (os outros são cantos, bordas e superfície), então trate o resultado como
      o <b>teto de nota possível</b> pela centralização, não como a nota final garantida.
    </div>

    <div class="panel" style="max-width:640px;margin-bottom:20px">
      <div class="panel-t">📋 Como usar</div>
      <ol class="cent-steps">
        <li>Coloque a carta sobre um <b>fundo branco</b>, bem iluminado, sem sombra forte.</li>
        <li>Fotografe <b>de cima, o mais reto possível</b> (evite ângulo e rotação — quanto mais alinhada a foto, mais precisa a medição).</li>
        <li>Carregue a foto abaixo.</li>
        <li>Ajuste os <b>8 pontos</b>: 4 na borda externa da carta (onde o papel termina) e 4 na borda interna
            (onde começa a moldura/arte impressa) — um ponto de cada em cada lado (esquerda, direita, topo, base).</li>
        <li>Veja a razão de centralização e a nota-teto estimada em PSA, BGS e CGC.</li>
      </ol>
    </div>

    <label class="cent-upload-zone" id="cent-upload-zone">
      <input type="file" id="cent-file-input" accept="image/*" style="display:none" onchange="centHandleFile(this.files[0])">
      <span style="font-size:28px">📷</span>
      <span style="margin-top:8px">Clique para carregar a foto da carta</span>
      <span style="font-size:10px;color:var(--muted);margin-top:4px">JPG, PNG — só neste navegador, não é salva</span>
    </label>
  `;
}

function centHandleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    CENT.dataUrl = e.target.result;
    CENT.edges = centDefaultEdges();
    renderCentralizacao();
  };
  reader.readAsDataURL(file);
}

function centReset() {
  CENT.dataUrl = null;
  CENT.edges = null;
  renderCentralizacao();
}

function centResetPoints() {
  CENT.edges = centDefaultEdges();
  centUpdateVisual();
}

// ── FERRAMENTA (imagem + retângulos + resultado) ─────────────────
function centRenderTool(holder) {
  holder.innerHTML = `
    <div class="sec-title" style="margin:0 0 6px">🎯 Avaliação de Centralização (pré-graduação)</div>
    <div class="mkt-note" style="margin-bottom:16px">
      Arraste os <b>4 pontos vermelhos</b> até a borda externa da carta e os <b>4 pontos dourados</b> até a borda
      interna (moldura/arte impressa) — um em cada lado. O resultado atualiza sozinho.
    </div>

    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
      <div class="cent-stage-wrap">
        <div class="cent-stage" id="cent-stage">
          <img src="${CENT.dataUrl}" id="cent-img" draggable="false">
          <div class="cent-rect cent-rect-outer" id="cent-rect-outer"></div>
          <div class="cent-rect cent-rect-inner" id="cent-rect-inner"></div>
          ${centHandlesHTML()}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="fic-btn" onclick="centResetPoints()">↺ Resetar pontos</button>
          <button class="fic-btn" onclick="centReset()">🗑️ Trocar foto</button>
        </div>
      </div>

      <div class="panel cent-result" id="cent-result" style="flex:1;min-width:280px"></div>
    </div>
  `;

  centBindDrag();
  centUpdateVisual();
}

function centHandlesHTML() {
  // outer = vermelho (borda física da carta), inner = dourado (borda impressa)
  // offset dos handles dentro de cada lado só pra não sobrepor outer/inner visualmente
  const cfg = [
    { rect: 'outer', side: 'l', cls: 'axis-h', pos: 'top:35%' },
    { rect: 'outer', side: 'r', cls: 'axis-h', pos: 'top:35%' },
    { rect: 'outer', side: 't', cls: 'axis-v', pos: 'left:35%' },
    { rect: 'outer', side: 'b', cls: 'axis-v', pos: 'left:35%' },
    { rect: 'inner', side: 'l', cls: 'axis-h', pos: 'top:65%' },
    { rect: 'inner', side: 'r', cls: 'axis-h', pos: 'top:65%' },
    { rect: 'inner', side: 't', cls: 'axis-v', pos: 'left:65%' },
    { rect: 'inner', side: 'b', cls: 'axis-v', pos: 'left:65%' }
  ];
  return cfg.map(h =>
    `<div class="cent-handle cent-handle-${h.rect} ${h.cls}" data-rect="${h.rect}" data-side="${h.side}" style="${h.pos}"></div>`
  ).join('');
}

function centBindDrag() {
  const stage = document.getElementById('cent-stage');
  if (!stage) return;

  stage.querySelectorAll('.cent-handle').forEach(handle => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      CENT.dragging = { rect: handle.dataset.rect, side: handle.dataset.side };
      handle.setPointerCapture(e.pointerId);
    });
  });

  if (CENT.listenersBound) return;
  CENT.listenersBound = true;

  window.addEventListener('pointermove', (e) => {
    if (!CENT.dragging) return;
    const stageEl = document.getElementById('cent-stage');
    if (!stageEl) { CENT.dragging = null; return; }
    const rectBound = stageEl.getBoundingClientRect();
    const { rect, side } = CENT.dragging;
    const MARGIN = 0.01;

    if (side === 'l' || side === 'r') {
      let pct = (e.clientX - rectBound.left) / rectBound.width;
      pct = Math.min(1, Math.max(0, pct));
      const edges = CENT.edges[rect];
      if (side === 'l') pct = Math.min(pct, edges.r - MARGIN);
      else pct = Math.max(pct, edges.l + MARGIN);
      edges[side] = pct;
    } else {
      let pct = (e.clientY - rectBound.top) / rectBound.height;
      pct = Math.min(1, Math.max(0, pct));
      const edges = CENT.edges[rect];
      if (side === 't') pct = Math.min(pct, edges.b - MARGIN);
      else pct = Math.max(pct, edges.t + MARGIN);
      edges[side] = pct;
    }
    centUpdateVisual();
  });

  window.addEventListener('pointerup', () => { CENT.dragging = null; });
  window.addEventListener('pointercancel', () => { CENT.dragging = null; });
}

// ── ATUALIZAÇÃO VISUAL + CÁLCULO ─────────────────────────────────
function centUpdateVisual() {
  const stage = document.getElementById('cent-stage');
  if (!stage || !CENT.edges) return;
  const { outer, inner } = CENT.edges;

  const outerEl = document.getElementById('cent-rect-outer');
  const innerEl = document.getElementById('cent-rect-inner');
  centPositionRect(outerEl, outer);
  centPositionRect(innerEl, inner);

  stage.querySelectorAll('.cent-handle').forEach(h => {
    const r = h.dataset.rect, side = h.dataset.side;
    const pct = CENT.edges[r][side];
    if (side === 'l' || side === 'r') h.style.left = (pct * 100) + '%';
    else h.style.top = (pct * 100) + '%';
  });

  centRenderResult();
}

function centPositionRect(el, e) {
  if (!el) return;
  el.style.left = (e.l * 100) + '%';
  el.style.top = (e.t * 100) + '%';
  el.style.width = ((e.r - e.l) * 100) + '%';
  el.style.height = ((e.b - e.t) * 100) + '%';
}

function centRenderResult() {
  const box = document.getElementById('cent-result');
  if (!box) return;
  const { outer, inner } = CENT.edges;

  const leftB = inner.l - outer.l;
  const rightB = outer.r - inner.r;
  const topB = inner.t - outer.t;
  const bottomB = outer.b - inner.b;

  if (leftB <= 0 || rightB <= 0 || topB <= 0 || bottomB <= 0) {
    box.innerHTML = `
      <div class="panel-t">📐 Resultado</div>
      <div style="font-size:11px;color:var(--muted);font-family:'Space Mono',monospace">
        Ajuste os pontos dourados (borda interna) pra dentro dos pontos vermelhos (borda externa) em todos os 4 lados
        pra calcular a centralização.
      </div>`;
    return;
  }

  const lr = centRatio(leftB, rightB, 'Esquerda', 'Direita');
  const tb = centRatio(topB, bottomB, 'Topo', 'Base');
  const worstPct = Math.max(lr.pctBig, tb.pctBig);

  const rows = ['PSA', 'BGS', 'CGC'].map(co => {
    const grade = centGradeFromBreaks(co, worstPct);
    return `<div class="cent-grade-row">
      <span class="cent-grade-co">${co}</span>
      <span class="cent-grade-badge">${grade}</span>
    </div>`;
  }).join('');

  box.innerHTML = `
    <div class="panel-t">📐 Resultado</div>
    <div class="cent-axis-line"><b>Esquerda/Direita:</b> ${lr.label} <span class="cent-axis-note">(${lr.note})</span></div>
    <div class="cent-axis-line"><b>Topo/Base:</b> ${tb.label} <span class="cent-axis-note">(${tb.note})</span></div>
    <div style="height:1px;background:var(--border);margin:12px 0"></div>
    <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:8px">
      Teto de nota pela centralização (considerando o eixo mais desalinhado):
    </div>
    ${rows}
    <div style="font-size:9.5px;color:var(--muted);font-family:'Space Mono',monospace;margin-top:12px;line-height:1.5">
      * Estimativa com base nos padrões públicos de cada empresa (front). A nota final também depende de cantos,
      bordas e superfície, e pode variar por versão/época de submissão — use como referência, não como garantia.
      Verso costuma ter tolerância maior e não entra nesse cálculo.
    </div>
  `;
}

function centRatio(a, b, nameA, nameB) {
  const total = a + b;
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  const pctBig = Math.round((big / total) * 100);
  const pctSmall = 100 - pctBig;
  const biggerSide = a > b ? nameA : nameB;
  const otherSide = a > b ? nameB : nameA;
  return {
    pctBig,
    label: `${pctBig}/${pctSmall}`,
    note: `borda de ${biggerSide.toLowerCase()} mais larga — carta puxada pro lado de ${otherSide.toLowerCase()}`
  };
}
