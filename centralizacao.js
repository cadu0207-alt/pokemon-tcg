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
  cardMm: null,          // {w,h} em mm da carta quando a foto foi corrigida (imagem = carta inteira); null = sem calibração
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
  backPct: '',                                        // % do lado maior do verso (opcional); '' = não medido
  worth: { co: 'PSA', raw: '', graded: '', cost: '' }, // calculadora "vale graduar?"
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
//
// TAG (Technical Authentication & Grading) — adicionada 11/08/2026 a
// pedido do Eduardo: é bem conhecida fora do Brasil e está chegando
// aqui. É a mais rígida das 4 em centralização: pede ~51/49 pro 10
// (Pristine), contra 55/45 do PSA. Diferente das outras, a TAG não
// usa um humano com régua — usa "Photometric Stereoscopic Imaging"
// (câmeras + luz calculando a carta em 3D) e visão computacional
// (machine learning), com pontuação interna numa escala de 1000
// pontos (10 = 950-989, Pristine = 990+) que é convertida pra escala
// 1-10. Ela também avalia um 5º critério que as outras não têm:
// Dimensões (mede o tamanho físico real da carta). Os números abaixo
// são a tabela pública de tolerância de centralização (front) pra
// TCG — acima de 8.5 a fonte não detalha publicamente, os degraus
// abaixo disso são extrapolação nossa seguindo o mesmo padrão de
// queda das outras 3 empresas.
// REVISÃO 17/10/2026 — fontes conferidas:
//  • CGC  — página oficial "Grading Scale" (cgccards.com): Pristine 10 = 50/50; Gem Mint 10 = frente ≤ ~55/45 e verso ≤ 75/25;
//    Mint 9 = 60/40 (verso 90/10); 8 = 65/35; 7,5 = 65/35; 7 = 70/30; 6 = 75/25; 4,5 = 85/15; 3,5 = 90/10. A CGC não dá % pro 9,5.
//  • TAG  — rubrica oficial (taggrading.com/pages/rubric): tolerâncias de frente por faixa (Pristine ~51/49; 10 ~55/45; 9 ~60/40;
//    8,5 ~62,5/37,5 … 3 ~90/10 … 1,5 ~98/2) e de verso pra TCG (Pristine ~52/48; 10 ~65/35; 9 ~75/25; 8,5 ~85/15; 8 ~95/5).
//  • PSA  — o site oficial não abriu pra conferência; usei o consenso dos guias (10: 55/45 frente e 75/25 verso; 9: 60/40 e 90/10).
//    Abaixo do 9 os guias divergem — ficou uma estimativa CONSERVADORA (a versão anterior dava 8,5 e 8 pra 65/35 e 70/30, o que
//    parece generoso; PSA não costuma dar meia nota além do 1,5).
//  • BGS  — a Beckett não publica % oficiais abaixo do 9,5 e os guias divergem; mantida a tabela anterior, marcada como estimativa.
// Cada item é [percentual máximo do lado maior, nota].
const CENT_BREAKS = {
  PSA: [
    [50, 10], [55, 10], [60, 9], [65, 8],
    [70, 7], [80, 6], [85, 5], [90, 3], [100, 2]
  ],
  BGS: [
    [50, 10], [55, 9.5], [60, 9], [65, 8.5],
    [70, 8], [75, 7.5], [80, 7], [85, 6], [90, 5], [100, 4]
  ],
  CGC: [
    [50, 10], [55, 10], [60, 9], [65, 8],
    [70, 7], [75, 6], [80, 5], [85, 4.5], [90, 3.5], [100, 3]
  ],
  TAG: [
    [51, 10], [55, 10], [60, 9], [62.5, 8.5], [65, 8], [67.5, 7.5], [70, 7],
    [72.5, 6.5], [75, 6], [77.5, 5.5], [80, 5], [82.5, 4.5], [85, 4],
    [87.5, 3.5], [90, 3], [92.5, 2.5], [95, 2], [100, 1.5]
  ]
};
// Verso (opcional): mesma ideia. BGS fica de fora (sem número confiável). TAG = coluna "TCG" da rubrica.
const CENT_BREAKS_BACK = {
  PSA: [[75, 10], [90, 9], [100, 8]],
  CGC: [[75, 10], [90, 9], [100, 8]],
  TAG: [[65, 10], [75, 9], [85, 8.5], [95, 8], [100, 7]]
};
const CENT_BREAKS_LABEL_EXTRA = {
  PSA: { 10: (pct) => pct <= 50 ? ' (perfeita)' : '' },
  BGS: { 10: () => ' · Pristine/Black Label*' },
  CGC: { 10: (pct) => pct <= 50 ? ' · Pristine' : ' · Gem Mint' },
  TAG: { 10: (pct) => pct <= 51 ? ' · Pristine (~990+/1000)*' : ' · Gem Mint' }
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
    centBindUploadExtras();
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
      <input type="file" id="cent-file-input" accept="image/*" style="display:none" onchange="centHandleFile(this.files[0]); this.value=''">
      <span style="font-size:28px">📷</span>
      <span style="margin-top:8px">Clique, arraste ou cole (Ctrl+V) a foto da carta</span>
      <span style="font-size:10px;color:var(--muted);margin-top:4px">JPG, PNG — só neste navegador, não é salva</span>
    </label>
    <label class="fic-btn" style="display:inline-block;margin-top:10px;cursor:pointer">
      <input type="file" accept="image/*" capture="environment" style="display:none" onchange="centHandleFile(this.files[0]); this.value=''">
      📸 Tirar foto agora (celular)
    </label>
  `;
}

const CENT_MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

function centToast(msg) { if (typeof toast === 'function') toast(msg, 'error'); else alert(msg); }

// 17/10/2026: valida o arquivo, respeita a orientação EXIF e reduz foto gigante (12 MP+ pesava na distorção e no celular).
async function centHandleFile(file) {
  if (!file) return;
  const nameType = (file.type || '') + ' ' + (file.name || '');
  if (/heic|heif/i.test(nameType)) { centToast('Fotos HEIC/HEIF não abrem direto no navegador — salve/exporte como JPG e tente de novo.'); return; }
  if (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || '')) { centToast('Esse arquivo não é uma imagem (use JPG ou PNG).'); return; }
  if (file.size > CENT_MAX_UPLOAD_BYTES) { centToast('A foto passa de 30 MB — reduza e tente de novo.'); return; }
  let dataUrl = null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const sc = Math.min(1, CENT_MAX_SRC / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    dataUrl = c.toDataURL('image/jpeg', 0.92);
    if (bmp.close) bmp.close();
  } catch (err) {
    dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => res(null); r.readAsDataURL(file); });
  }
  if (!dataUrl) { centToast('Não consegui abrir essa imagem.'); return; }
  CENT.rawDataUrl = dataUrl;
  CENT.dataUrl = null;
  CENT.cardMm = null;
  CENT.corners = centDefaultCorners();
  renderCentralizacao();
}

// arrastar e soltar na zona de upload + colar (Ctrl+V) com a aba aberta
function centBindUploadExtras() {
  const zone = document.getElementById('cent-upload-zone');
  if (zone) {
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('cent-drop-over'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('cent-drop-over'); }));
    zone.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) centHandleFile(f); });
  }
  if (!CENT.pasteBound) {
    CENT.pasteBound = true;
    document.addEventListener('paste', (e) => {
      const pane = document.getElementById('centralizacao');
      if (!pane || !pane.classList.contains('active') || CENT.rawDataUrl) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) { if (it.kind === 'file' && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) { e.preventDefault(); centHandleFile(f); } return; } }
    });
  }
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
  CENT.backPct = '';
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
  CENT.cardMm = null;   // foto usada como veio: o enquadramento é desconhecido, então não dá pra converter pixel em mm
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

// Corrige a perspectiva: o quadrilátero marcado pelo usuário (4 cantos da carta) vira um retângulo com a proporção
// REAL da carta (63 × 88 mm). 17/10/2026: antes usava 2 triângulos afins (o canvas 2D só tem transformação afim) — na
// diagonal a imagem ficava desalinhada em foto inclinada. Agora é uma homografia de verdade, calculada pixel a pixel
// com amostragem bilinear. Como o resultado tem a proporção exata da carta, a ferramenta também sabe quantos mm vale
// cada pixel (ver centMmPerStagePx) e mostra a largura das bordas em milímetros.
const CENT_CARD_MM = { w: 63, h: 88 };
const CENT_MAX_SRC = 3600;   // maior lado da foto de origem usada na distorção (limita memória em celular)
const CENT_MAX_OUT = 2200;   // maior lado da imagem corrigida

// resolve H tal que  src = H(dst)  (dst e src: 4 pontos {x,y})
function centSolveHomography(dst, src) {
  const A = [], bvec = [];
  for (let i = 0; i < 4; i++) {
    const u = dst[i].x, v = dst[i].y, x = src[i].x, y = src[i].y;
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); bvec.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); bvec.push(y);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {            // eliminação de Gauss com pivô parcial
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) throw new Error('cantos degenerados');
    [A[c], A[piv]] = [A[piv], A[c]]; [bvec[c], bvec[piv]] = [bvec[piv], bvec[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      bvec[r] -= f * bvec[c];
    }
  }
  const h = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = bvec[r];
    for (let k = r + 1; k < n; k++) sum -= A[r][k] * h[k];
    h[r] = sum / A[r][r];
  }
  return h;
}

function centWarpPerspective(imgEl, quad) {
  // 1) foto de origem (reduzida se for enorme)
  const sc = Math.min(1, CENT_MAX_SRC / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
  const sw = Math.max(1, Math.round(imgEl.naturalWidth * sc)), sh = Math.max(1, Math.round(imgEl.naturalHeight * sc));
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sw; srcCanvas.height = sh;
  const sctx = srcCanvas.getContext('2d');
  sctx.drawImage(imgEl, 0, 0, sw, sh);
  const src = sctx.getImageData(0, 0, sw, sh).data;
  const q = { tl: { x: quad.tl.x * sc, y: quad.tl.y * sc }, tr: { x: quad.tr.x * sc, y: quad.tr.y * sc },
              br: { x: quad.br.x * sc, y: quad.br.y * sc }, bl: { x: quad.bl.x * sc, y: quad.bl.y * sc } };

  // 2) tamanho de saída: lado médio marcado, na proporção real da carta (retrato ou paisagem)
  const wAvg = (centDist(q.tl, q.tr) + centDist(q.bl, q.br)) / 2;
  const hAvg = (centDist(q.tl, q.bl) + centDist(q.tr, q.br)) / 2;
  const landscape = wAvg > hAvg;
  const mm = landscape ? { w: CENT_CARD_MM.h, h: CENT_CARD_MM.w } : { w: CENT_CARD_MM.w, h: CENT_CARD_MM.h };
  let W = Math.max(wAvg, hAvg * mm.w / mm.h);   // mantém a resolução do lado que veio maior
  let H = W * mm.h / mm.w;
  const k = Math.min(1, CENT_MAX_OUT / Math.max(W, H));
  W = Math.max(80, Math.round(W * k)); H = Math.max(80, Math.round(H * k));

  // 3) homografia retângulo de saída → quadrilátero de origem
  const dstPts = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const h = centSolveHomography(dstPts, [q.tl, q.tr, q.br, q.bl]);

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  const img = octx.createImageData(W, H);
  const od = img.data;
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const pu = u + 0.5, pv = v + 0.5;
      const wgt = h[6] * pu + h[7] * pv + 1;
      const x = (h[0] * pu + h[1] * pv + h[2]) / wgt - 0.5;
      const y = (h[3] * pu + h[4] * pv + h[5]) / wgt - 0.5;
      const o = (v * W + u) * 4;
      if (x < 0 || y < 0 || x > sw - 1 || y > sh - 1) { od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = 255; continue; }
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        od[o + c] = src[i00 + c] * (1 - fx) * (1 - fy) + src[i10 + c] * fx * (1 - fy) + src[i01 + c] * (1 - fx) * fy + src[i11 + c] * fx * fy;
      }
      od[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  CENT.cardMm = mm;          // a imagem corrigida É a carta inteira: serve pra calibrar mm
  return out.toDataURL('image/jpeg', 0.95);
}

function centDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

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
            <span id="cent-ruler-lbl">Réguas (cm)</span>
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
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="fic-btn fic-btn-primary" onclick="centCopyResult()">📋 Copiar resultado</button>
          <button class="fic-btn fic-btn-primary" onclick="centDownloadImage()">🖼️ Baixar imagem com as marcações</button>
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

// ── VALE GRADUAR? (17/10/2026) ─────────────────────────────────────────────────────────────────────
// Não existe tabela confiável de "quanto vale cada nota" (varia por carta e por semana), então a conta é do usuário: ele
// informa o valor da carta crua, quanto ela vale NA NOTA ESTIMADA (olhe vendas recentes da mesma carta graduada) e o custo
// total (taxa da empresa + frete + impostos/IOF). A ferramenta dá o ganho líquido e o ponto de equilíbrio.
function centWorthHTML() {
  const w = CENT.worth;
  const opt = (v) => `<option value="${v}" ${w.co === v ? 'selected' : ''}>${v}</option>`;
  return `
    <div class="panel cent-result" style="margin-top:16px" id="cent-worth-panel">
      <div class="panel-t">💰 Vale a pena graduar?</div>
      <div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:10px">
        Preencha com valores reais de venda recente da MESMA carta. Inclua no custo a taxa da empresa, o frete e impostos.
      </div>
      <div class="cent-subgrade-block"><div class="cent-subgrade-lbl">Empresa</div>
        <select class="cv-select" id="cent-worth-co" style="width:100%">${['PSA', 'BGS', 'CGC', 'TAG'].map(opt).join('')}</select></div>
      <div class="cent-subgrade-block"><div class="cent-subgrade-lbl">Valor da carta crua (R$)</div>
        <input class="cv-select" id="cent-worth-raw" type="number" min="0" step="0.01" style="width:100%" value="${w.raw}"></div>
      <div class="cent-subgrade-block"><div class="cent-subgrade-lbl">Valor dela graduada na nota estimada (R$)</div>
        <input class="cv-select" id="cent-worth-graded" type="number" min="0" step="0.01" style="width:100%" value="${w.graded}"></div>
      <div class="cent-subgrade-block"><div class="cent-subgrade-lbl">Custo total de graduar (R$)</div>
        <input class="cv-select" id="cent-worth-cost" type="number" min="0" step="0.01" style="width:100%" value="${w.cost}"></div>
      <div id="cent-worth-out" style="font-size:12px;line-height:1.6;margin-top:8px"></div>
    </div>`;
}
function centBindWorthInputs() {
  const ids = { co: 'cent-worth-co', raw: 'cent-worth-raw', graded: 'cent-worth-graded', cost: 'cent-worth-cost' };
  Object.keys(ids).forEach(k => {
    const el = document.getElementById(ids[k]);
    if (el) el.addEventListener('input', () => { CENT.worth[k] = el.value; centRenderWorth(); });
  });
  centRenderWorth();
}
function centRenderWorth() {
  const out = document.getElementById('cent-worth-out');
  if (!out) return;
  const w = CENT.worth, raw = parseFloat(w.raw), graded = parseFloat(w.graded), cost = parseFloat(w.cost);
  const r = centCurrentResult();
  const row = r ? r.rows.find(x => x.co === w.co) : null;
  const nota = row ? (row.overall !== null ? `${row.overall} (geral estimada)` : `${row.centLabel} (só centralização — preencha cantos/bordas/superfície pra nota geral)`) : '—';
  let html = `<div>Nota estimada na ${w.co}: <b>${nota}</b></div>`;
  if ([raw, graded, cost].every(v => Number.isFinite(v) && v >= 0)) {
    const ganho = graded - raw - cost, equilibrio = raw + cost;
    const cor = ganho >= 0 ? '#16a34a' : '#e74c3c';
    html += `<div>Ganho líquido se sair essa nota: <b style="color:${cor}">${ganho >= 0 ? '+' : '−'}R$ ${fmtR(Math.abs(ganho))}</b></div>
             <div>Ponto de equilíbrio: a carta graduada precisa valer <b>R$ ${fmtR(equilibrio)}</b> ou mais.</div>
             <div style="font-size:10px;color:var(--muted)">Se a nota sair 1 ponto abaixo do estimado o valor da carta pode cair muito (e a graduação não devolve o custo) — teste esse cenário também.</div>`;
  } else {
    html += `<div style="color:var(--muted)">Preencha os 3 valores pra ver o ganho e o ponto de equilíbrio.</div>`;
  }
  out.innerHTML = html;
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

  const backOpts = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map(v =>
    `<option value="${v}" ${CENT.backPct == v ? 'selected' : ''}>${v}/${100 - v}</option>`).join('');
  const backBlock = `
      <div class="cent-subgrade-block">
        <div class="cent-subgrade-lbl">🔄 Centralização do verso (opcional)</div>
        <div class="cent-subgrade-hint">O verso também conta pro 10 (PSA ≤ 75/25, CGC Gem Mint ≤ 75/25, TAG ~65/35 no TCG). Meça igual à frente (outra foto) ou estime a olho. A BGS não entra: não há número confiável do verso.</div>
        <select class="cv-select" id="cent-back" style="width:100%">
          <option value="">— não medi o verso —</option>${backOpts}
        </select>
      </div>`;
  return `
    <div class="panel cent-result" style="margin-top:16px">
      <div class="panel-t">🧐 Autoavaliação — Cantos, Bordas e Superfície</div>
      <div style="font-size:10px;color:var(--muted);font-family:'Space Mono',monospace;margin-bottom:10px">
        Esses 3 critérios não dá pra medir com pontos na imagem — dependem de luz rasante e toque. Compare a
        carta com as descrições e escolha a nota mais próxima. Use o botão "Inspecionar canto" pra dar zoom.
      </div>
      ${blocks}
      ${backBlock}
    </div>
    ${centWorthHTML()}
  `;
}

function centBindSubgradeInputs() {
  const back = document.getElementById('cent-back');
  if (back) back.addEventListener('change', () => { CENT.backPct = back.value === '' ? '' : parseFloat(back.value); centRenderResult(); });
  centBindWorthInputs();
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
  centZoomChanged();
}

// ── ZOOM / PAN ─────────────────────────────────────────────────────
function centSetZoom(val) {
  CENT.zoom = Math.min(3, Math.max(0.4, parseFloat(val) || 1));
  const slider = document.getElementById('cent-zoom-slider');
  if (slider) slider.value = CENT.zoom;
  const valEl = document.getElementById('cent-zoom-val');
  if (valEl) valEl.textContent = Math.round(CENT.zoom * 100) + '%';
  centApplyPhotoTransform();
  centZoomChanged();
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
  centZoomChanged();
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

// régua real e mm dependem do zoom (mover a foto não muda a escala, então o pan não chama isto)
function centZoomChanged() {
  if (!CENT.cardMm) return;
  centBuildRulers();
  if (CENT.edges) centRenderResult();
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

// px de tela por mm (x e y) — só existe quando a foto foi corrigida (a imagem inteira = a carta). Considera zoom atual.
function centPxPerMm() {
  if (!CENT.cardMm || !CENT.natW) return null;
  const eff = (CENT.baseScale || 1) * (CENT.zoom || 1);
  return { x: CENT.natW * eff / CENT.cardMm.w, y: CENT.natH * eff / CENT.cardMm.h };
}

// ── RÉGUAS (cm) ─────────────────────────────────────────────────────
function centBuildRulers() {
  const hEl = document.getElementById('cent-ruler-h');
  const vEl = document.getElementById('cent-ruler-v');
  const stage = document.getElementById('cent-stage');
  if (!hEl || !vEl || !stage) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  // com a foto corrigida a régua é REAL (1 cm = 10 mm da carta, acompanha o zoom); sem correção é só referência visual
  const ppm = centPxPerMm();
  const pxX = ppm ? ppm.x * 10 : CENT_PX_PER_CM, pxY = ppm ? ppm.y * 10 : CENT_PX_PER_CM;
  const lbl = document.getElementById('cent-ruler-lbl');
  if (lbl) lbl.textContent = ppm ? 'Réguas (cm reais da carta)' : 'Réguas (cm, referência)';

  let hHtml = '', vHtml = '';
  for (let cm = 0; cm * pxX <= w; cm++) {
    hHtml += `<div class="cent-tick cent-tick-h" style="left:${cm * pxX}px"><span>${cm}</span></div>`;
  }
  for (let cm = 0; cm * pxY <= h; cm++) {
    vHtml += `<div class="cent-tick cent-tick-v" style="top:${cm * pxY}px"><span>${cm}</span></div>`;
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
  const SIDE = { l: 'esquerda', r: 'direita', t: 'superior', b: 'inferior' };
  return cfg.map(h =>
    `<div class="cent-handle cent-handle-${h.rect} ${h.cls}" data-rect="${h.rect}" data-side="${h.side}" style="${h.pos}" tabindex="0" role="slider" aria-label="Ponto da borda ${h.rect === 'outer' ? 'externa (física)' : 'interna (impressa)'} ${SIDE[h.side]} — setas movem, Shift move mais" aria-valuemin="0" aria-valuemax="100"></div>`
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
      centLoupeShow(e);
    });
    // teclado (17/10/2026): setas movem 0,1% do palco; Shift = 1%. Esq/Dir nos pontos esquerda/direita, Cima/Baixo nos de topo/base.
    handle.addEventListener('keydown', (e) => {
      const rect = handle.dataset.rect, side = handle.dataset.side;
      const horiz = side === 'l' || side === 'r';
      const dir = horiz ? ({ ArrowLeft: -1, ArrowRight: 1 })[e.key] : ({ ArrowUp: -1, ArrowDown: 1 })[e.key];
      if (!dir) return;
      e.preventDefault();
      const step = (e.shiftKey ? 0.01 : 0.001) * dir;
      const edges = CENT.edges[rect], MARGIN = 0.01;
      let pct = edges[side] + step;
      pct = Math.min(1, Math.max(0, pct));
      if (side === 'l') pct = Math.min(pct, edges.r - MARGIN);
      else if (side === 'r') pct = Math.max(pct, edges.l + MARGIN);
      else if (side === 't') pct = Math.min(pct, edges.b - MARGIN);
      else pct = Math.max(pct, edges.t + MARGIN);
      edges[side] = pct;
      centScheduleVisual();
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
    centScheduleVisual();
    centLoupeMove(e);
  });

  window.addEventListener('pointerup', () => { CENT.dragging = null; CENT.panning = null; centLoupeHide(); });
  window.addEventListener('pointercancel', () => { CENT.dragging = null; CENT.panning = null; centLoupeHide(); });
}

// ── LUPA (17/10/2026) ────────────────────────────────────────────────
// No celular o dedo cobre o ponto de 20 px que está sendo arrastado. Durante o arraste aparece um círculo com a foto
// ampliada 3x ao redor do ponteiro (mira no centro), no canto oposto do palco pra não ficar debaixo do dedo.
const CENT_LOUPE = { size: 120, zoom: 3 };
function centLoupeShow(e) {
  centLoupeHide();
  const stage = document.getElementById('cent-stage'), layer = document.getElementById('cent-photo-layer');
  if (!stage || !layer) return;
  const loupe = document.createElement('div');
  loupe.className = 'cent-loupe'; loupe.id = 'cent-loupe';
  loupe.style.width = loupe.style.height = CENT_LOUPE.size + 'px';
  const inner = document.createElement('div');
  inner.className = 'cent-loupe-inner';
  inner.style.width = stage.clientWidth + 'px'; inner.style.height = stage.clientHeight + 'px';
  const clone = layer.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  inner.appendChild(clone);
  loupe.appendChild(inner);
  const cross = document.createElement('div'); cross.className = 'cent-loupe-cross';
  loupe.appendChild(cross);
  stage.appendChild(loupe);
  centLoupeMove(e);
}
function centLoupeMove(e) {
  const stage = document.getElementById('cent-stage'), loupe = document.getElementById('cent-loupe');
  if (!stage || !loupe) return;
  const b = stage.getBoundingClientRect();
  const px = Math.min(b.width, Math.max(0, e.clientX - b.left)), py = Math.min(b.height, Math.max(0, e.clientY - b.top));
  const R = CENT_LOUPE.size / 2, Z = CENT_LOUPE.zoom;
  loupe.firstChild.style.transform = `translate(${R - px * Z}px, ${R - py * Z}px) scale(${Z})`;
  // canto oposto ao ponteiro (em cima à esquerda; se o ponteiro estiver ali, vai pra baixo à direita)
  const nearTL = px < CENT_LOUPE.size + 40 && py < CENT_LOUPE.size + 40;
  loupe.style.left = nearTL ? '' : '8px'; loupe.style.right = nearTL ? '8px' : '';
  loupe.style.top = nearTL ? '' : '8px'; loupe.style.bottom = nearTL ? '8px' : '';
}
function centLoupeHide() { const l = document.getElementById('cent-loupe'); if (l) l.remove(); }

// ── ATUALIZAÇÃO VISUAL + CÁLCULO ─────────────────────────────────
// 17/10/2026: o painel de resultado era reescrito inteiro a cada pointermove (dezenas de vezes por segundo) — agora 1x por quadro
let _centRaf = 0;
function centScheduleVisual() {
  if (_centRaf) return;
  _centRaf = requestAnimationFrame(() => { _centRaf = 0; centUpdateVisual(); });
}

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
    h.setAttribute('aria-valuenow', (pct * 100).toFixed(1));
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
  // largura das bordas em mm (só com foto corrigida). As frações de `edges` são do palco, então converte via px/mm.
  const stageEl = document.getElementById('cent-stage');
  const ppm = centPxPerMm();
  const fmtMm = (f, axis) => ppm && stageEl ? ((f * (axis === 'x' ? stageEl.clientWidth / ppm.x : stageEl.clientHeight / ppm.y)).toFixed(1).replace('.', ',') + ' mm') : null;
  const mmLR = ppm ? ` · ${fmtMm(leftB, 'x')} / ${fmtMm(rightB, 'x')}` : '';
  const mmTB = ppm ? ` · ${fmtMm(topB, 'y')} / ${fmtMm(bottomB, 'y')}` : '';
  const worstPct = Math.max(lr.pctBig, tb.pctBig);

  const allSubsSet = CENT.subgrades.corners !== '' && CENT.subgrades.edges !== '' && CENT.subgrades.surface !== '';
  const rows = centCompanyRows(worstPct).map(r => {
    let overallHtml = '';
    if (r.overall !== null) {
      const lim = r.limit.length
        ? `<span class="cent-axis-note" style="display:block">${r.co === 'PSA' ? 'limitada por' : 'puxam a média'}: ${r.limit.join(', ')}</span>`
        : '';
      overallHtml = `<span class="cent-grade-overall">geral: <b>${r.overall}</b></span>${lim}`;
    }
    return `<div class="cent-grade-row">
      <span class="cent-grade-co">${r.co}</span>
      <span class="cent-grade-badge">centr.: ${r.centLabel}</span>
      ${overallHtml}
    </div>`;
  }).join('');

  box.innerHTML = `
    <div class="panel-t">📐 Resultado</div>
    <div class="cent-axis-line"><b>Esquerda/Direita:</b> ${lr.label}${mmLR} <span class="cent-axis-note">(${lr.note})</span></div>
    <div class="cent-axis-line"><b>Topo/Base:</b> ${tb.label}${mmTB} <span class="cent-axis-note">(${tb.note})</span></div>
    ${ppm ? '' : `<div class="cent-axis-note" style="margin-top:4px">Sem correção de perspectiva não dá pra mostrar as bordas em mm — use "Recalibrar perspectiva" marcando os 4 cantos da carta.</div>`}
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
      * Estimativa com base nos padrões públicos de cada empresa (frente; o verso só entra se você informar no campo
      opcional). Tabelas de <b style="color:var(--text)">CGC</b> e <b style="color:var(--text)">TAG</b> conferidas nas
      páginas oficiais (out/2026); <b style="color:var(--text)">PSA</b> pelo consenso dos guias (o site oficial não
      pôde ser conferido) e <b style="color:var(--text)">BGS</b> estimada (a Beckett não publica % abaixo do 9,5). PSA usa
      o pior dos 4 critérios; BGS, CGC e TAG fazem uma média. A TAG mede com câmeras e visão computacional numa escala
      própria de 1000 pontos, então a "nota geral" dela aqui é só uma aproximação nossa pra escala 1-10. Pode variar
      por versão/época de submissão — use como referência, não como garantia.
    </div>
  `;
  centRenderWorth();
}

// nota de cada empresa: teto de centralização + (com a autoavaliação preenchida) nota geral e o que a limita.
// PSA pega o pior dos 4 critérios; BGS/CGC/TAG fazem a média em meio ponto (aproximação nossa, ver aviso no rodapé).
function centCompanyRows(worstPct) {
  const subs = CENT.subgrades;
  const all = subs.corners !== '' && subs.edges !== '' && subs.surface !== '';
  return ['PSA', 'BGS', 'CGC', 'TAG'].map(co => {
    const frontGrade = centGradeFromBreaks(co, worstPct);
    const back = CENT.backPct !== '' && CENT.backPct != null && CENT_BREAKS_BACK[co]
      ? (() => { for (const [mx, g] of CENT_BREAKS_BACK[co]) if (CENT.backPct <= mx) return g; return 7; })() : null;
    const centGrade = back !== null ? Math.min(frontGrade, back) : frontGrade;
    let centLabel = centGradeLabel(co, frontGrade, worstPct);
    if (back !== null && back < frontGrade) centLabel = `${centGrade} (o verso limita)`;
    let overall = null, limit = [];
    if (all) {
      const parts = [[back !== null && back < frontGrade ? 'centralização (verso)' : 'centralização', centGrade], ['cantos', parseFloat(subs.corners)], ['bordas', parseFloat(subs.edges)], ['superfície', parseFloat(subs.surface)]];
      const minV = Math.min.apply(null, parts.map(x => x[1]));
      overall = co === 'PSA' ? minV : Math.round(parts.reduce((t, x) => t + x[1], 0) / 4 * 2) / 2;
      if (!parts.every(x => x[1] === minV)) limit = parts.filter(x => x[1] === minV).map(x => `${x[0]} (${x[1]})`);
    }
    return { co, centGrade, centLabel, overall, limit, backGrade: back };
  });
}

// dados do resultado atual (ou null se os pontos ainda estão cruzados)
function centCurrentResult() {
  if (!CENT.edges) return null;
  const { outer, inner } = CENT.edges;
  const leftB = inner.l - outer.l, rightB = outer.r - inner.r, topB = inner.t - outer.t, bottomB = outer.b - inner.b;
  if (leftB <= 0 || rightB <= 0 || topB <= 0 || bottomB <= 0) return null;
  const lr = centRatio(leftB, rightB, 'Esquerda', 'Direita'), tb = centRatio(topB, bottomB, 'Topo', 'Base');
  const stage = document.getElementById('cent-stage'), ppm = centPxPerMm();
  const mm = (f, axis) => (ppm && stage) ? (f * (axis === 'x' ? stage.clientWidth / ppm.x : stage.clientHeight / ppm.y)).toFixed(1).replace('.', ',') + ' mm' : null;
  return {
    lr, tb,
    mmLR: ppm ? `${mm(leftB, 'x')} / ${mm(rightB, 'x')}` : null,
    mmTB: ppm ? `${mm(topB, 'y')} / ${mm(bottomB, 'y')}` : null,
    rows: centCompanyRows(Math.max(lr.pctBig, tb.pctBig))
  };
}

function centResultText() {
  const r = centCurrentResult();
  if (!r) return null;
  const lines = ['Centralização (frente) — MyDeck',
    `Esquerda/Direita: ${r.lr.label}${r.mmLR ? ' (' + r.mmLR + ')' : ''}`,
    `Topo/Base: ${r.tb.label}${r.mmTB ? ' (' + r.mmTB + ')' : ''}`];
  r.rows.forEach(x => lines.push(`${x.co}: centr. ${x.centLabel}${x.overall !== null ? ' · geral ' + x.overall + (x.limit.length ? ' (' + x.limit.join(', ') + ')' : '') : ''}`));
  lines.push('Estimativa pelos padrões públicos de cada empresa — não é garantia de nota. mydecktcg.com.br');
  return lines.join('\n');
}

async function centCopyResult() {
  const txt = centResultText();
  if (!txt) { centToast('Posicione os pontos primeiro (os dourados ficam por dentro dos vermelhos).'); return; }
  try { await navigator.clipboard.writeText(txt); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e2) {} ta.remove();
  }
  if (typeof toast === 'function') toast('Resultado copiado!');
}

// imagem do palco como está na tela (foto com zoom/rotação/posição + os 2 retângulos) com o resultado embaixo
function centDownloadImage() {
  const r = centCurrentResult();
  const stage = document.getElementById('cent-stage'), img = document.getElementById('cent-img');
  if (!r || !stage || !img || !img.naturalWidth) { centToast('Posicione os pontos primeiro.'); return; }
  const vw = stage.clientWidth, vh = stage.clientHeight, pad = 26 + r.rows.length * 18 + 22;
  const k = 2; // 2x pra ficar nítido
  const c = document.createElement('canvas'); c.width = vw * k; c.height = (vh + pad) * k;
  const g = c.getContext('2d'); g.scale(k, k);
  g.fillStyle = '#000'; g.fillRect(0, 0, vw, vh + pad);
  const eff = (CENT.baseScale || 1) * (CENT.zoom || 1);
  g.save(); g.beginPath(); g.rect(0, 0, vw, vh); g.clip();
  g.translate((vw - CENT.natW) / 2 + (CENT.panOffsetX || 0) + CENT.natW / 2, (vh - CENT.natH) / 2 + (CENT.panOffsetY || 0) + CENT.natH / 2);
  g.scale(eff, eff); g.rotate((CENT.rotation || 0) * Math.PI / 180);
  g.drawImage(img, -CENT.natW / 2, -CENT.natH / 2, CENT.natW, CENT.natH);
  g.restore();
  const { outer, inner } = CENT.edges;
  const box = (e, color) => { g.strokeStyle = color; g.lineWidth = 2; g.strokeRect(e.l * vw, e.t * vh, (e.r - e.l) * vw, (e.b - e.t) * vh); };
  box(outer, '#e63946'); box(inner, '#ffd166');
  g.fillStyle = '#fff'; g.font = '13px sans-serif';
  let y = vh + 20;
  g.fillText(`Esq/Dir ${r.lr.label}${r.mmLR ? ' (' + r.mmLR + ')' : ''}   ·   Topo/Base ${r.tb.label}${r.mmTB ? ' (' + r.mmTB + ')' : ''}`, 10, y); y += 18;
  r.rows.forEach(x => { g.fillText(`${x.co}: centr. ${x.centLabel}${x.overall !== null ? ' · geral ' + x.overall : ''}`, 10, y); y += 18; });
  g.fillStyle = '#9aa0c0'; g.font = '10px sans-serif';
  g.fillText('Estimativa pelos padrões públicos — não é garantia de nota · mydecktcg.com.br', 10, vh + pad - 8);
  c.toBlob(blob => {
    if (!blob) { centToast('Não consegui gerar a imagem.'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'centralizacao-mydeck.png';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

function centRatio(a, b, nameA, nameB) {
  const total = a + b;
  const big = Math.max(a, b);
  const small = Math.min(a, b);
  // 17/10/2026: antes arredondava pra INTEIRO antes de comparar com o limite da nota — 55,4/44,6 virava "55/45" e levava
  // PSA 10 (o limite é 55/45). Agora 1 casa decimal: o rótulo e a nota usam o mesmo número (55,4 → nota 9).
  const pctBig = Math.round((big / total) * 1000) / 10;
  const pctSmall = Math.round((100 - pctBig) * 10) / 10;
  const biggerSide = a > b ? nameA : nameB;
  const otherSide = a > b ? nameB : nameA;
  return {
    pctBig,
    label: `${pctBig.toFixed(1)}/${pctSmall.toFixed(1)}`,
    note: pctBig <= 50 ? 'perfeitamente centralizada nesse eixo' : `borda de ${biggerSide.toLowerCase()} mais larga — carta puxada pro lado de ${otherSide.toLowerCase()}`
  };
}
