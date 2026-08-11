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
// Além da centralização, os graduadores avaliam mais 3 critérios
// (cantos, bordas, superfície) que não dá pra medir com pontos —
// dependem de luz rasante, textura, risco etc. Por isso a aba tem
// também um bloco de autoavaliação guiada desses 3 critérios (com
// atalhos de zoom pra inspecionar cada canto de perto), que se
// combina com a nota de centralização pra estimar uma nota GERAL
// mais próxima da realidade — PSA pega o pior dos 4 critérios, BGS/
// CGC fazem uma média dos 4 (com subgrades).
//
// CORREÇÃO DE PERSPECTIVA (11/08/2026): foto de celular quase nunca
// sai 100% de frente — fica meio em ângulo (perspectiva/keystone),
// o que é diferente de "torta" (rotação no plano, já corrigida pelo
// slider de rotação). Antes de entrar na ferramenta de medição, o
// usuário marca os 4 cantos EXTREMOS da carta na foto original;
// presumimos que a carta é um retângulo perfeito e distorcemos a
// foto (canvas, warp por triangulação afim — 2 triângulos por
// retângulo, técnica clássica de "texture mapping") pra encaixar
// esses 4 pontos num retângulo reto. Só depois disso entram a
// rotação fina, zoom/pan e os 8 pontos de centralização.
//
// IMPORTANTE: a imagem é processada 100% no navegador (FileReader +
// canvas). Nada é enviado nem salvo no Supabase — é só uma
// ferramenta local de apoio, como pedido pelo Eduardo.
// ================================================================

const CENT_PX_PER_CM = 28; // escala visual da régua — referência aproximada, não calibrada ao monitor do usuário

const CENT = {
  rawDataUrl: null,      // foto original, como veio do upload (pode estar em ângulo)
  dataUrl: null,          // foto usada na ferramenta — igual à raw, ou já corrigida de perspectiva
  corners: null,            // {tl,tr,br,bl}:{x,y} frações 0..1 — os 4 cantos marcados na foto original
  calibDragging: null,        // 'tl'|'tr'|'br'|'bl' — canto sendo arrastado na tela de calibração
  calibListenersBound: false,
  edges: null,          // {outer:{l,r,t,b}, inner:{l,r,t,b}} — frações 0..1 (relativas ao viewport/stage)
  dragging: null,        // {rect:'outer'|'inner', side:'l'|'r'|'t'|'b'}
  panning: null,          // {startX,startY,startPanX,startPanY} — pan da FOTO (não confundir com os pontos)
  rotation: 0,             // graus, corrige foto tirada torta
  zoom: 1,                  // multiplicador sobre o baseScale (fit inicial)
  panOffsetX: 0,              // deslocamento extra da foto a partir do centro, em px de tela
  panOffsetY: 0,
  baseScale: 1,                 // escala calculada pra caber a foto no viewport
  natW: 0, natH: 0,               // dimensões naturais da imagem carregada
  guidesOn: true,                  // linhas-guia horizontal/vertical fixas (retas de referência)
  rulersOn: true,                   // réguas com marcação em cm
  subgrades: { corners: '', edges: '', surface: '' }, // autoavaliação manual 1-10
  listenersBound: false
};

function centDefaultCorners() {
  return {
    tl: { x: 0.05, y: 0.05 }, tr: { x: 0.95, y: 0.05 },
    br: { x: 0.95, y: 0.95 }, bl: { x: 0.05, y: 0.95 }
  };
}

function centDefaultEdges() {
  return {
    outer: { l: 0.03, r: 0.97, t: 0.03, b: 0.97 },
    inner: { l: 0.10, r: 0.90, t: 0.10, b: 0.90 }
  };
}

// ── TABELAS DE PADRÃO DE CENTRALIZAÇÃO (frente) ──────────────────
// Cada item é [percentual máximo do lado maior, nota]. Fontes: PSA
// (55/45 pro 10 desde a mudança de padrão em 2025, 60/40 pro 9), BGS
// (Black Label/Pristine exige 50/50 literal), CGC (50/50 pro
// Pristine 10). Estimativas educadas a partir dos padrões públicos.
const CENT_BREAKS = {
  PSA: [
    [50, 10], [55, 10], [60, 9], [65, 8.5],
    [70, 8], [75, 7], [80, 6], [85, 5], [90, 4], [100, 3]
  ],
  BGS: [
    [50, 10], [55, 9.5], [60, 9], [65, 8.5],
    [70, 8], [75, 7.5], [80, 7], [85, 6], [90, 5], [100, 4]
  ],
  CGC: [
    [50, 10], [55, 9.5], [65, 9], [70, 8.5],
    [75, 8], [80, 7.5], [85, 7], [90, 6], [100, 5]
  ]
};
const CENT_BREAKS_LABEL_EXTRA = {
  PSA: { 10: (pct) => pct <= 50 ? ' (perfeita)' : '' },
  BGS: { 10: () => ' · Pristine/Black Label*' },
  CGC: { 10: () => ' · Pristine' }
};

function centGradeFromBreaks(company, pctBig) {
  const breaks = CENT_BREAKS[company];
  for (const [max, grade] of breaks) {
    if (pctBig <= max) return grade;
  }
  return breaks[breaks.length - 1][1];
}
function centGradeLabel(company, grade, pctBig) {
  const extraFn = CENT_BREAKS_LABEL_EXTRA[company] && CENT_BREAKS_LABEL_EXTRA[company][grade];
  const prefix = grade <= 3 ? '≤ ' : '';
  return `${prefix}${grade}${extraFn ? extraFn(pctBig) : ''}`;
}

// ── CRITÉRIOS MANUAIS (cantos / bordas / superfície) ──────────────
// Não dá pra medir com pontos — depende de luz rasante, textura,
// risco fino etc. Por isso é autoavaliação guiada: o usuário compara
// a carta com a descrição de cada faixa e escolhe a nota mais
// próxima. Fontes: guias públicos de PSA/BGS/CGC (ver conversa).
const CENT_SUBGRADE_GUIDE = {
  corners: {
    label: '📐 Cantos',
    hint: 'Cheque puxando levemente a unha na ponta de cada canto — se sentir "áspero" ou desfiado (fraying), já não é 10.',
    scale: [
      [10, 'Perfeitos, sem nenhum arredondamento ou desfiado, mesmo na lupa'],
      [8, 'Quase perfeitos — arredondamento mínimo em 1 canto, só visível de perto'],
      [6, 'Arredondamento leve visível a olho nu em 1-2 cantos'],
      [4, 'Desfiado (whitening/fraying) claro em pelo menos 1 canto'],
      [2, 'Cantos visivelmente gastos, amassados ou com dobra']
    ]
  },
  edges: {
    label: '📏 Bordas',
    hint: 'Passe o olho rente à lateral da carta sob luz — procure lasca (chipping) ou fio branco exposto.',
    scale: [
      [10, 'Lisas e limpas nas 4 laterais, sem nenhuma lasca ou ponto branco'],
      [8, 'Quase perfeitas — 1 ponto minúsculo de desgaste, difícil de ver'],
      [6, 'Pequenas lascas/whitening visíveis em 1-2 pontos'],
      [4, 'Lascas claras em várias partes da borda'],
      [2, 'Bordas bem desgastadas ou com entalhe visível']
    ]
  },
  surface: {
    label: '✨ Superfície',
    hint: 'Incline a carta sob uma luz forte (luz rasante) e gire devagar — risco, vinco e "print line" só aparecem assim.',
    scale: [
      [10, 'Sem risco, vinco, mancha ou defeito de impressão em nenhum ângulo de luz'],
      [8, 'Quase perfeita — risco de superfície mínimo, só visível em ângulo específico'],
      [6, 'Riscos leves visíveis ou pequena marca de holo (holo damage)'],
      [4, 'Riscos claros, mancha ou linha de impressão visível a olho nu'],
      [2, 'Vinco (crease), mancha grande ou dano de superfície evidente']
    ]
  }
};

// ── RENDER PRINCIPAL ──────────────────────────────────────────────
function renderCentralizacao() {
  const holder = document.getElementById('centralizacao-wrap');
  if (!holder) return;

  if (!CENT.rawDataUrl) {
    holder.innerHTML = centUploadScreenHTML();
    return;
  }
  if (!CENT.dataUrl) {
    centRenderCalib(holder);
    return;
  }
  centRenderTool(holder);
}

function centUploadScreenHTML() {
  return `
    <div class="sec-title" style="margin:0 0 6px">🎯 Avaliação de Centralização (pré-graduação)</div>
    <div class="mkt-note" style="margin-bottom:20px">
      Ferramenta pra estimar sua nota <b>antes de mandar a carta pra graduação</b> (PSA, BGS, CGC) — combina a
      medição de <b>centralização</b> (pelos pontos) com uma autoavaliação guiada de <b>cantos, bordas e
      superfície</b>, que são os outros 3 critérios que as empresas usam. A imagem é processada só no seu
      navegador — <b>não é enviada nem salva</b> em lugar nenhum.
    </div>

    <div class="panel" style="max-width:640px;margin-bottom:20px">
      <div class="panel-t">📋 Como usar</div>
      <ol class="cent-steps">
        <li>Coloque a carta sobre um <b>fundo branco</b>, bem iluminada, sem sombra forte.</li>
        <li>Fotografe <b>de cima, o mais reto possível</b>.</li>
        <li>Carregue a foto abaixo.</li>
        <li>Se a foto ficou meio em ângulo, marque os <b>4 cantos da carta</b> na tela seguinte — a ferramenta
            corrige a perspectiva pra deixar a carta reta.</li>
        <li>Use a <b>rotação</b> pra alinhar a carta nas linhas-guia, e o <b>zoom/mover foto</b> pra encaixar
            nas réguas de cm.</li>
        <li>Ajuste os <b>8 pontos</b> (4 na borda externa, 4 na interna) pra medir a centralização.</li>
        <li>Responda a autoavaliação de <b>cantos, bordas e superfície</b> — dá pra usar o zoom pra inspecionar
            cada canto de perto.</li>
        <li>Veja a nota-teto de centralização e a <b>nota geral estimada</b> em PSA, BGS e CGC.</li>
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
    CENT.rawDataUrl = e.target.result;
    CENT.dataUrl = null;
    CENT.corners = centDefaultCorners();
    renderCentralizacao();
  };
  reader.readAsDataURL(file);
}

function centReset() {
  CENT.rawDataUrl = null;
  CENT.dataUrl = null;
  CENT.edges = null;
  renderCentralizacao();
}

function centResetPoints() {
  CENT.edges = centDefaultEdges();
  centUpdateVisual();
}

function centStartTool() {
  CENT.edges = centDefaultEdges();
  CENT.rotation = 0;
  CENT.zoom = 1;
  CENT.panOffsetX = 0;
  CENT.panOffsetY = 0;
  CENT.guidesOn = true;
  CENT.rulersOn = true;
  CENT.subgrades = { corners: '', edges: '', surface: '' };
  renderCentralizacao();
}

// ── CALIBRAÇÃO DE PERSPECTIVA (4 cantos) ──────────────────────────
function centRenderCalib(holder) {
  holder.innerHTML = `
    <div class="sec-title" style="margin:0 0 6px">📐 Corrigir perspectiva (opcional)</div>
    <div class="mkt-note" style="margin-bottom:16px">
      Se a foto foi tirada com a carta meio de lado (perspectiva/ângulo, diferente de foto só torta), arraste
      os <b>4 pontos numerados</b> pros <b>cantos exatos da carta</b> — não do fundo branco. A ferramenta
      presume que a carta é um retângulo perfeito e distorce a foto pra encaixar nesses 4 pontos, deixando a
      medição de centralização bem mais confiável. Se a foto já saiu bem de frente, pode pular.
    </div>

    <div class="cent-calib-wrap">
      <div class="cent-calib-stage" id="cent-calib-stage">
        <img src="${CENT.rawDataUrl}" id="cent-calib-img" draggable="false">
        <svg class="cent-calib-quad" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon id="cent-calib-poly" points="" fill="rgba(6,214,160,.14)" stroke="var(--teal)" stroke-width="0.4" vector-effect="non-scaling-stroke"></polygon>
        </svg>
        ${centCornerHandlesHTML()}
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="fic-btn fic-btn-primary" onclick="centApplyCalib()">✅ Aplicar correção e continuar</button>
      <button class="fic-btn" onclick="centSkipCalib()">⏭️ Pular (foto já está reta)</button>
      <button class="fic-btn" onclick="centReset()">🗑️ Trocar foto</button>
    </div>
  `;
  centBindCornerDrag();
}

function centCornerHandlesHTML() {
  const order = [['tl', '1'], ['tr', '2'], ['br', '3'], ['bl', '4']];
  return order.map(([key, num]) => {
    const c = CENT.corners[key];
    return `<div class="cent-corner-handle" data-corner="${key}" style="left:${c.x * 100}%;top:${c.y * 100}%"><span>${num}</span></div>`;
  }).join('');
}

function centBindCornerDrag() {
  const stage = document.getElementById('cent-calib-stage');
  if (!stage) return;

  stage.querySelectorAll('.cent-corner-handle').forEach(h => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      CENT.calibDragging = h.dataset.corner;
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
    });
  });

  if (!CENT.calibListenersBound) {
    CENT.calibListenersBound = true;
    window.addEventListener('pointermove', (e) => {
      if (!CENT.calibDragging) return;
      const stageEl = document.getElementById('cent-calib-stage');
      if (!stageEl) { CENT.calibDragging = null; return; }
      const b = stageEl.getBoundingClientRect();
      let x = (e.clientX - b.left) / b.width;
      let y = (e.clientY - b.top) / b.height;
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
      CENT.corners[CENT.calibDragging] = { x, y };
      centUpdateCalibVisual();
    });
    window.addEventListener('pointerup', () => { CENT.calibDragging = null; });
    window.addEventListener('pointercancel', () => { CENT.calibDragging = null; });
  }

  centUpdateCalibVisual();
}

function centUpdateCalibVisual() {
  const stage = document.getElementById('cent-calib-stage');
  if (!stage) return;
  stage.querySelectorAll('.cent-corner-handle').forEach(h => {
    const c = CENT.corners[h.dataset.corner];
    h.style.left = (c.x * 100) + '%';
    h.style.top = (c.y * 100) + '%';
  });
  const poly = document.getElementById('cent-calib-poly');
  if (poly) {
    const o = CENT.corners;
    const pts = [o.tl, o.tr, o.br, o.bl].map(p => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(' ');
    poly.setAttribute('points', pts);
  }
}

function centSkipCalib() {
  CENT.dataUrl = CENT.rawDataUrl;
  centStartTool();
}

function centApplyCalib() {
  const img = document.getElementById('cent-calib-img');
  if (!img || !img.naturalWidth) return;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const toPx = (f) => ({ x: f.x * nw, y: f.y * nh });
  const quad = {
    tl: toPx(CENT.corners.tl), tr: toPx(CENT.corners.tr),
    br: toPx(CENT.corners.br), bl: toPx(CENT.corners.bl)
  };
  try {
    CENT.dataUrl = centWarpPerspective(img, quad);
  } catch (err) {
    alert('Não deu pra aplicar a correção de perspectiva — tenta ajustar os 4 pontos de novo.');
    return;
  }
  centStartTool();
}

function centOpenCalib() {
  CENT.dataUrl = null;
  renderCentralizacao();
}

// Distorce a foto original pra que o quadrilátero marcado pelo usuário
// (4 cantos da carta) vire um retângulo perfeito. Técnica: divide o
// quadrilátero em 2 triângulos e usa uma transformação afim (canvas
// 2D só suporta afim, não perspectiva "de verdade") pra mapear cada
// triângulo da foto original pro triângulo correspondente no
// retângulo de destino. É uma aproximação — não é uma homografia
// matemática exata — mas funciona bem pro caso de uso (foto de carta
// com inclinação leve/moderada de celular).
function centWarpPerspective(imgEl, quad) {
  const wTop = centDist(quad.tl, quad.tr);
  const wBot = centDist(quad.bl, quad.br);
  const hLeft = centDist(quad.tl, quad.bl);
  const hRight = centDist(quad.tr, quad.br);
  const W = Math.max(80, Math.round((wTop + wBot) / 2));
  const H = Math.max(80, Math.round((hLeft + hRight) / 2));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const d = { tl: { x: 0, y: 0 }, tr: { x: W, y: 0 }, br: { x: W, y: H }, bl: { x: 0, y: H } };

  centDrawWarpedTriangle(ctx, imgEl, quad.tl, quad.tr, quad.br, d.tl, d.tr, d.br);
  centDrawWarpedTriangle(ctx, imgEl, quad.tl, quad.br, quad.bl, d.tl, d.br, d.bl);

  return canvas.toDataURL('image/jpeg', 0.95);
}

function centDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function centDrawWarpedTriangle(ctx, img, s0, s1, s2, d0, d1, d2) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denom;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
  const dd = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denom;

  ctx.transform(a, b, c, dd, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// ── FERRAMENTA (imagem + retângulos + resultado) ─────────────────
function centRenderTool(holder) {
  holder.innerHTML = `
    <div class="sec-title" style="margin:0 0 6px">🎯 Avaliação de Centralização (pré-graduação)</div>
    <div class="mkt-note" style="margin-bottom:16px">
      Arraste os <b>4 pontos vermelhos</b> até a borda externa da carta e os <b>4 pontos dourados</b> até a borda
      interna — um em cada lado. O resultado atualiza sozinho.
    </div>

    <div class="cent-warn" id="cent-warn">
      ⚠️ <b>Se a carta não estiver alinhada com as linhas-guia</b> (reta vertical + horizontal), use a
      <b>rotação</b> pra alinhar. Use o <b>zoom e mover foto</b> pra encaixar a carta nas réguas de cm antes de
      marcar os 8 pontos — isso deixa a medição mais precisa.
    </div>

    <div class="cent-layout">
      <div class="cent-sidebar">
        <div class="panel cent-result" id="cent-result"></div>
        ${centSubgradesHTML()}
      </div>

      <div class="cent-main">
        <div class="cent-toolbar">
          <div class="cent-tool-group">
            <span class="cent-tool-lbl">🔍 Zoom</span>
            <button class="fic-btn" onclick="centNudgeZoom(-0.1)">−</button>
            <input type="range" id="cent-zoom-slider" min="0.4" max="3" step="0.05" value="${CENT.zoom}" oninput="centSetZoom(this.value)">
            <button class="fic-btn" onclick="centNudgeZoom(0.1)">+</button>
            <span class="cent-tool-val" id="cent-zoom-val">${Math.round(CENT.zoom * 100)}%</span>
          </div>
          <label class="cent-guide-toggle">
            <input type="checkbox" id="cent-ruler-toggle" ${CENT.rulersOn ? 'checked' : ''} onchange="centToggleRulers(this.checked)">
            Réguas (cm)
          </label>
          <label class="cent-guide-toggle">
            <input type="checkbox" id="cent-guide-toggle" ${CENT.guidesOn ? 'checked' : ''} onchange="centToggleGuides(this.checked)">
            Linhas-guia
          </label>
        </div>

        <div class="cent-grid" id="cent-grid">
          <div class="cent-ruler-corner"></div>
          <div class="cent-ruler-h" id="cent-ruler-h"></div>
          <div class="cent-ruler-v" id="cent-ruler-v"></div>
          <div class="cent-stage" id="cent-stage">
            <div class="cent-photo-layer" id="cent-photo-layer">
              <img src="${CENT.dataUrl}" id="cent-img" draggable="false">
            </div>
            <div class="cent-guide-v" id="cent-guide-v"></div>
            <div class="cent-guide-h" id="cent-guide-h"></div>
            <div class="cent-rect cent-rect-outer" id="cent-rect-outer"></div>
            <div class="cent-rect cent-rect-inner" id="cent-rect-inner"></div>
            ${centHandlesHTML()}
          </div>
        </div>

        <div class="cent-pan-row">
          <span class="cent-tool-lbl">✋ Mover foto</span>
          <div class="cent-pan-pad">
            <button class="fic-btn cent-pan-btn" style="grid-area:up" onclick="centNudgePan(0,-20)" title="Mover pra cima">↑</button>
            <button class="fic-btn cent-pan-btn" style="grid-area:left" onclick="centNudgePan(-20,0)" title="Mover pra esquerda">←</button>
            <button class="fic-btn cent-pan-btn" style="grid-area:center" onclick="centResetZoomPan()" title="Centralizar">⊙</button>
            <button class="fic-btn cent-pan-btn" style="grid-area:right" onclick="centNudgePan(20,0)" title="Mover pra direita">→</button>
            <button class="fic-btn cent-pan-btn" style="grid-area:down" onclick="centNudgePan(0,20)" title="Mover pra baixo">↓</button>
          </div>
          <span class="cent-pan-hint">ou arraste a foto direto com o mouse</span>
        </div>

        <div class="cent-corner-row">
          <span class="cent-tool-lbl">🔎 Inspecionar canto</span>
          <button class="fic-btn" onclick="centInspectCorner('tl')">↖ Sup. esq.</button>
          <button class="fic-btn" onclick="centInspectCorner('tr')">↗ Sup. dir.</button>
          <button class="fic-btn" onclick="centInspectCorner('bl')">↙ Inf. esq.</button>
          <button class="fic-btn" onclick="centInspectCorner('br')">↘ Inf. dir.</button>
        </div>

        <div class="cent-rotate-row">
          <span class="cent-rotate-lbl">🔄 Alinhar rotação</span>
          <input type="range" id="cent-rotate-slider" min="-15" max="15" step="0.1" value="${CENT.rotation}"
                 oninput="centSetRotation(this.value)">
          <span class="cent-rotate-val" id="cent-rotate-val">${CENT.rotation.toFixed(1)}°</span>
          <button class="fic-btn" onclick="centResetRotation()">↺ 0°</button>
        </div>

        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="fic-btn" onclick="centResetPoints()">↺ Resetar pontos</button>
          <button class="fic-btn" onclick="centResetZoomPan()">↺ Resetar zoom/posição</button>
          <button class="fic-btn" onclick="centOpenCalib()">📐 Recalibrar perspectiva</button>
          <button class="fic-btn" onclick="centReset()">🗑️ Trocar foto</button>
        </div>
      </div>
    </div>
  `;

  centBindDrag();
  centBindPan();
  centWireImgLoad();
  centUpdateVisual();
  centUpdateRotateBadge();
  centBindSubgradeInputs();
}

// ── SUBGRADES MANUAIS (cantos / bordas / superfície) ──────────────
function centSubgradesHTML() {
  const blocks = Object.keys(CENT_SUBGRADE_GUIDE).map(key => {
    const g = CENT_SUBGRADE_GUIDE[key];
    const opts = g.scale.map(([n, desc]) =>
      `<option value="${n}" ${CENT.subgrades[key] == n ? 'selected' : ''}>${n} — ${desc}</option>`
    ).join('');
    return `
      <div class="cent-subgrade-block">
        <div class="cent-subgrade-lbl">${g.label}</div>
        <div class="cent-subgrade-hint">${g.hint}</div>
        <select class="cv-select" id="cent-sub-${key}" data-key="${key}" style="width:100%">
          <option value="">— selecione a nota mais próxima —</option>
          ${opts}
        </select>
      </div>`;
  }).join('');

  return `
    <div class="panel cent-result" style="margin-top:16px">
      <div class="panel-t">🧐 Autoavaliação — Cantos, Bordas e Superfície</div>
      <div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:10px">
        Esses 3 critérios não dá pra medir com pontos na imagem — dependem de luz rasante e toque. Compare a
        carta com as descrições e escolha a nota mais próxima. Use o botão "Inspecionar canto" pra dar zoom.
      </div>
      ${blocks}
    </div>
  `;
}

function centBindSubgradeInputs() {
  document.querySelectorAll('.cent-subgrade-block select').forEach(sel => {
    sel.addEventListener('change', () => {
      CENT.subgrades[sel.dataset.key] = sel.value;
      centRenderResult();
    });
  });
}

// zoom alto direto num canto, pra facilitar inspeção visual antes de dar nota
function centInspectCorner(corner) {
  if (!CENT.natW) return;
  CENT.zoom = 2.4;
  const slider = document.getElementById('cent-zoom-slider');
  if (slider) slider.value = CENT.zoom;
  const valEl = document.getElementById('cent-zoom-val');
  if (valEl) valEl.textContent = Math.round(CENT.zoom * 100) + '%';

  const stage = document.getElementById('cent-stage');
  if (!stage) return;
  const vw = stage.clientWidth, vh = stage.clientHeight;
  const eff = CENT.baseScale * CENT.zoom;
  const baseLeft = (vw - CENT.natW) / 2, baseTop = (vh - CENT.natH) / 2;
  // desloca a foto de forma que o canto escolhido fique visível dentro do viewport
  const marginX = (CENT.natW * eff - vw) / 2;
  const marginY = (CENT.natH * eff - vh) / 2;
  const dx = corner === 'tl' || corner === 'bl' ? marginX : -marginX;
  const dy = corner === 'tl' || corner === 'tr' ? marginY : -marginY;
  CENT.panOffsetX = Math.max(-marginX, Math.min(marginX, dx));
  CENT.panOffsetY = Math.max(-marginY, Math.min(marginY, dy));
  centApplyPhotoTransform();
}

// ── ZOOM / PAN ─────────────────────────────────────────────────────
function centSetZoom(val) {
  CENT.zoom = Math.min(3, Math.max(0.4, parseFloat(val) || 1));
  const slider = document.getElementById('cent-zoom-slider');
  if (slider) slider.value = CENT.zoom;
  const valEl = document.getElementById('cent-zoom-val');
  if (valEl) valEl.textContent = Math.round(CENT.zoom * 100) + '%';
  centApplyPhotoTransform();
}
function centNudgeZoom(delta) { centSetZoom((CENT.zoom || 1) + delta); }

function centNudgePan(dx, dy) {
  CENT.panOffsetX = (CENT.panOffsetX || 0) + dx;
  CENT.panOffsetY = (CENT.panOffsetY || 0) + dy;
  centApplyPhotoTransform();
}

function centResetZoomPan() {
  CENT.zoom = 1;
  CENT.panOffsetX = 0;
  CENT.panOffsetY = 0;
  const slider = document.getElementById('cent-zoom-slider');
  if (slider) slider.value = 1;
  const valEl = document.getElementById('cent-zoom-val');
  if (valEl) valEl.textContent = '100%';
  centApplyPhotoTransform();
}

function centWireImgLoad() {
  const img = document.getElementById('cent-img');
  if (!img) return;
  if (img.complete && img.naturalWidth) centComputeInitialFit();
  else img.onload = centComputeInitialFit;
}

function centComputeInitialFit() {
  const stage = document.getElementById('cent-stage');
  const img = document.getElementById('cent-img');
  if (!stage || !img || !img.naturalWidth) return;
  const vw = stage.clientWidth, vh = stage.clientHeight;
  CENT.natW = img.naturalWidth;
  CENT.natH = img.naturalHeight;
  CENT.baseScale = Math.min(vw / CENT.natW, vh / CENT.natH) * 0.96;
  img.style.width = CENT.natW + 'px';
  img.style.height = CENT.natH + 'px';
  centApplyPhotoTransform();
  centBuildRulers();
}

function centApplyPhotoTransform() {
  const stage = document.getElementById('cent-stage');
  const layer = document.getElementById('cent-photo-layer');
  if (!stage || !layer || !CENT.natW) return;
  const vw = stage.clientWidth, vh = stage.clientHeight;
  const baseLeft = (vw - CENT.natW) / 2;
  const baseTop = (vh - CENT.natH) / 2;
  const eff = (CENT.baseScale || 1) * (CENT.zoom || 1);
  layer.style.left = (baseLeft + (CENT.panOffsetX || 0)) + 'px';
  layer.style.top = (baseTop + (CENT.panOffsetY || 0)) + 'px';
  layer.style.transform = `scale(${eff}) rotate(${CENT.rotation || 0}deg)`;
}

function centBindPan() {
  const stage = document.getElementById('cent-stage');
  if (!stage) return;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.cent-handle')) return; // deixa o drag do ponto cuidar disso
    CENT.panning = {
      startX: e.clientX, startY: e.clientY,
      startPanX: CENT.panOffsetX || 0, startPanY: CENT.panOffsetY || 0
    };
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
}

// ── RÉGUAS (cm) ─────────────────────────────────────────────────────
function centBuildRulers() {
  const hEl = document.getElementById('cent-ruler-h');
  const vEl = document.getElementById('cent-ruler-v');
  const stage = document.getElementById('cent-stage');
  if (!hEl || !vEl || !stage) return;
  const w = stage.clientWidth, h = stage.clientHeight;

  let hHtml = '', vHtml = '';
  for (let cm = 0; cm * CENT_PX_PER_CM <= w; cm++) {
    hHtml += `<div class="cent-tick cent-tick-h" style="left:${cm * CENT_PX_PER_CM}px"><span>${cm}</span></div>`;
  }
  for (let cm = 0; cm * CENT_PX_PER_CM <= h; cm++) {
    vHtml += `<div class="cent-tick cent-tick-v" style="top:${cm * CENT_PX_PER_CM}px"><span>${cm}</span></div>`;
  }
  hEl.innerHTML = hHtml;
  vEl.innerHTML = vHtml;
}

function centToggleRulers(checked) {
  CENT.rulersOn = checked;
  const grid = document.getElementById('cent-grid');
  if (grid) grid.classList.toggle('cent-rulers-off', !checked);
}

// ── ROTAÇÃO / LINHAS-GUIA ────────────────────────────────────────
function centSetRotation(val) {
  CENT.rotation = parseFloat(val) || 0;
  const valEl = document.getElementById('cent-rotate-val');
  if (valEl) valEl.textContent = CENT.rotation.toFixed(1) + '°';
  centApplyPhotoTransform();
  centUpdateRotateBadge();
}

function centResetRotation() {
  CENT.rotation = 0;
  const slider = document.getElementById('cent-rotate-slider');
  if (slider) slider.value = 0;
  centSetRotation(0);
}

function centToggleGuides(checked) {
  CENT.guidesOn = checked;
  const v = document.getElementById('cent-guide-v');
  const h = document.getElementById('cent-guide-h');
  if (v) v.style.display = checked ? '' : 'none';
  if (h) h.style.display = checked ? '' : 'none';
}

function centUpdateRotateBadge() {
  const warn = document.getElementById('cent-warn');
  if (!warn) return;
  const abs = Math.abs(CENT.rotation);
  warn.classList.remove('cent-warn-ok', 'cent-warn-mid', 'cent-warn-high');
  if (abs === 0) warn.classList.add('cent-warn-mid');
  else if (abs <= 5) warn.classList.add('cent-warn-ok');
  else warn.classList.add('cent-warn-high');
}

// ── PONTOS (centralização) ───────────────────────────────────────
function centHandlesHTML() {
  // outer = vermelho (borda física da carta), inner = dourado (borda impressa)
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
      e.stopPropagation();
      CENT.dragging = { rect: handle.dataset.rect, side: handle.dataset.side };
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    });
  });

  if (CENT.listenersBound) return;
  CENT.listenersBound = true;

  window.addEventListener('pointermove', (e) => {
    if (CENT.panning) {
      const dx = e.clientX - CENT.panning.startX;
      const dy = e.clientY - CENT.panning.startY;
      CENT.panOffsetX = CENT.panning.startPanX + dx;
      CENT.panOffsetY = CENT.panning.startPanY + dy;
      centApplyPhotoTransform();
      return;
    }
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

  window.addEventListener('pointerup', () => { CENT.dragging = null; CENT.panning = null; });
  window.addEventListener('pointercancel', () => { CENT.dragging = null; CENT.panning = null; });
}

// ── ATUALIZAÇÃO VISUAL + CÁLCULO ─────────────────────────────────
function centUpdateVisual() {
  const stage = document.getElementById('cent-stage');
  if (!stage || !CENT.edges) return;
  const { outer, inner } = CENT.edges;

  centPositionRect(document.getElementById('cent-rect-outer'), outer);
  centPositionRect(document.getElementById('cent-rect-inner'), inner);

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
        Ajuste os pontos dourados (borda interna) pra dentro dos pontos vermelhos (borda externa) em todos os
        4 lados pra calcular a centralização.
      </div>`;
    return;
  }

  const lr = centRatio(leftB, rightB, 'Esquerda', 'Direita');
  const tb = centRatio(topB, bottomB, 'Topo', 'Base');
  const worstPct = Math.max(lr.pctBig, tb.pctBig);

  const subs = CENT.subgrades;
  const allSubsSet = subs.corners !== '' && subs.edges !== '' && subs.surface !== '';

  const rows = ['PSA', 'BGS', 'CGC'].map(co => {
    const centGrade = centGradeFromBreaks(co, worstPct);
    const centLabel = centGradeLabel(co, centGrade, worstPct);

    let overallHtml = '';
    if (allSubsSet) {
      const c = parseFloat(subs.corners), e = parseFloat(subs.edges), s = parseFloat(subs.surface);
      let overall;
      if (co === 'PSA') {
        overall = Math.min(centGrade, c, e, s);
      } else {
        overall = (centGrade + c + e + s) / 4;
        overall = Math.round(overall * 2) / 2; // meio ponto, como BGS/CGC
      }
      overallHtml = `<span class="cent-grade-overall">geral: <b>${overall}</b></span>`;
    }

    return `<div class="cent-grade-row">
      <span class="cent-grade-co">${co}</span>
      <span class="cent-grade-badge">centr.: ${centLabel}</span>
      ${overallHtml}
    </div>`;
  }).join('');

  box.innerHTML = `
    <div class="panel-t">📐 Resultado</div>
    <div class="cent-axis-line"><b>Esquerda/Direita:</b> ${lr.label} <span class="cent-axis-note">(${lr.note})</span></div>
    <div class="cent-axis-line"><b>Topo/Base:</b> ${tb.label} <span class="cent-axis-note">(${tb.note})</span></div>
    <div style="height:1px;background:var(--border);margin:12px 0"></div>
    <div style="font-size:10.5px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:8px">
      Nota-teto de centralização e nota geral estimada (combinando com a autoavaliação de cantos/bordas/superfície
      ao lado):
    </div>
    ${rows}
    ${!allSubsSet ? `<div style="font-size:10px;color:var(--gold);font-family:'Space Mono',monospace;margin-top:8px">
      Responda a autoavaliação de cantos, bordas e superfície abaixo pra ver a nota geral estimada.
    </div>` : ''}
    <div style="font-size:9.5px;color:var(--muted);font-family:'Space Mono',monospace;margin-top:12px;line-height:1.5">
      * Estimativa com base nos padrões públicos de cada empresa (front). PSA usa o pior dos 4 critérios; BGS e
      CGC fazem uma média. Pode variar por versão/época de submissão — use como referência, não como garantia.
      Verso não entra nesse cálculo.
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
