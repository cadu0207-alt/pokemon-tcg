// ================================================================
// MyDeck — Modo solo: MAPA DE KANTO em 3D (alpha, 28/11/2026)
// ================================================================
// Maquete realista desenhada na placa de vídeo (WebGL2), sem biblioteca e sem imagem baixada: terreno com relevo,
// mar com fundo visível e brilho do sol, florestas, cidades com prédios, sombras de verdade que acompanham o sol,
// nuvens passando, fumaça, lava e luzes no fim da tarde. A posição das cidades vem do mapa 2D (wild_solo_mapa.js),
// que continua valendo como reserva para aparelhos sem placa de vídeo suficiente.
//
// Mesma interface do mapa 2D: wsMapa.render(elemento, { cities, badges, open, onCity, types }) → { destroy, sun }.
// ================================================================
(function () {
  'use strict';
  const reserva = window.wsMapa;
  if (!reserva || !window.wsDetalhes) return;
  const SPOTS = reserva.SPOTS, D = window.wsDetalhes; // D: enfeites, casas, fazendas e o que se mexe
  const MW = 360, MH = 460;                       // mapa, nas mesmas unidades do 2D
  const DOM = { x0: -30, y0: -30, w: 420, h: 520 }; // área do terreno (sobra mar em volta)
  const wx = mx => mx - MW / 2, wz = my => my - MH / 2;

  const CONTINENTE = 'M30 70 C58 36 112 62 150 48 S214 30 250 56 S318 58 334 104 S322 150 336 186 S330 236 338 282 S300 336 274 332 S262 372 220 374 S168 372 148 344 S108 332 74 336 S28 322 32 280 S54 240 40 206 S14 168 30 132 S18 94 30 70 Z';
  const ILHA = 'M26 392 C30 368 60 362 82 370 S114 392 106 412 S76 438 52 430 S22 412 26 392 Z';
  const VULCAO = [72, 386], SAFARI = [294, 276];
  // bosques: centro, raios, quantidade, tipo
  const BOSQUES = [
    [70, 256, 44, 48, 520, 'pinho'], [80, 318, 46, 20, 180, 'pinho'], [200, 158, 34, 22, 100, 'copa'], [318, 300, 24, 30, 90, 'copa'],
    [146, 330, 30, 18, 90, 'copa'], [130, 62, 40, 14, 110, 'pinho'], [252, 316, 24, 15, 60, 'copa'], [318, 126, 20, 20, 60, 'copa'],
    [56, 150, 20, 26, 80, 'pinho'], [262, 70, 30, 14, 60, 'pinho'], [136, 240, 20, 18, 40, 'copa'], [180, 280, 28, 20, 50, 'copa'],
    [292, 270, 36, 28, 28, 'acacia'], [60, 408, 34, 20, 26, 'palmeira'], [96, 396, 14, 24, 10, 'palmeira'],
  ];
  const RIO = [[168, 44, 160, 66, 196, 72, 188, 92], [188, 92, 180, 112, 150, 118, 164, 142], [164, 142, 178, 166, 236, 150, 246, 178], [246, 178, 256, 206, 306, 196, 346, 218]];
  const LAGOS = [[230, 80, 22, 12], [108, 206, 17, 10]];
  const CAMPOS = [[262, 224, 36, 22, -0.14], [122, 316, 30, 17, 0.1], [248, 122, 26, 15, -0.2], [170, 222, 22, 26, 0.3], [236, 292, 24, 18, -0.05]];

  // ── contas ────────────────────────────────────────────────────
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mix = (a, b, t) => a + (b - a) * t;
  const suave = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(x, y) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function ruido(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return mix(mix(hash(xi, yi), hash(xi + 1, yi), u), mix(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
  }
  const fbm = (x, y, n) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < n; i++) { s += a * ruido(x * f, y * f); a *= 0.5; f *= 2.03; } return s / (1 - Math.pow(0.5, n)); };
  const crista = (x, y) => { let s = 0, a = 0.6, f = 1; for (let i = 0; i < 4; i++) { const r = 1 - Math.abs(ruido(x * f + i * 7, y * f) * 2 - 1); s += a * r * r; a *= 0.5; f *= 2.1; } return s; };
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(px - ax - dx * t, py - ay - dy * t); }
  const linhaDist = (px, py, l) => { let m = 1e9; for (let i = 1; i < l.length; i++) m = Math.min(m, segDist(px, py, l[i - 1][0], l[i - 1][1], l[i][0], l[i][1])); return m; };
  const rioPontos = () => RIO.flatMap(c => Array.from({ length: 13 }, (_, i) => { const t = i / 12, u = 1 - t; return [0, 1].map(k => u * u * u * c[k] + 3 * u * u * t * c[2 + k] + 3 * u * t * t * c[4 + k] + t * t * t * c[6 + k]); }));

  // ── mundo (calculado uma vez e reaproveitado) ─────────────────
  let mundo = null;
  function criarMundo(nomes) {
    const rota = nomes.map(n => (n === 'Cinnabar' ? [102, 405] : [SPOTS[n][0], SPOTS[n][1] + 6]));
    const ramal = [[102, 405], [88, 424], [64, 428], [48, 418]]; // da ponte até a vila de Cinnabar
    const rio = rioPontos();
    // distância até o litoral, a partir do desenho do continente e da ilha
    const mascara = document.createElement('canvas'); mascara.width = DOM.w; mascara.height = DOM.h;
    const mg = mascara.getContext('2d', { willReadFrequently: true });
    mg.translate(-DOM.x0, -DOM.y0); mg.fillStyle = '#fff'; mg.fill(new Path2D(CONTINENTE)); mg.fill(new Path2D(ILHA));
    const px = mg.getImageData(0, 0, DOM.w, DOM.h).data;
    const dist = dentro => {
      const W = DOM.w, H = DOM.h, d = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) d[i] = (px[i * 4 + 3] > 127) === dentro ? 999 : 0;
      const olha = (i, j, c) => { if (d[j] + c < d[i]) d[i] = d[j] + c; };
      for (let y = 1; y < H; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; olha(i, i - 1, 1); olha(i, i - W, 1); olha(i, i - W - 1, 1.414); olha(i, i - W + 1, 1.414); }
      for (let y = H - 2; y >= 0; y--) for (let x = W - 2; x > 0; x--) { const i = y * W + x; olha(i, i + 1, 1); olha(i, i + W, 1); olha(i, i + W + 1, 1.414); olha(i, i + W - 1, 1.414); }
      return d;
    };
    const din = dist(true), dout = dist(false);
    const litoral = (x, y) => { const i = clamp(Math.round(y - DOM.y0), 0, DOM.h - 1) * DOM.w + clamp(Math.round(x - DOM.x0), 0, DOM.w - 1); return din[i] - dout[i]; };

    const SERRAS = [[98, 70, 82, 38, 54], [142, 78, 36, 26, 24], [300, 86, 48, 32, 40], [40, 176, 28, 46, 28], [190, 44, 40, 14, 17]];
    function relevoNatural(x, y) {
      const d = litoral(x, y) + (fbm(x / 17, y / 17, 3) - 0.5) * 11;
      if (d < 0) return -Math.min(15, 0.5 - d * 0.58) - (fbm(x / 30, y / 30, 3) - 0.5) * 2;
      let h = 0.2 + suave(0, 11, d) * 2.8 + suave(5, 34, d) * (fbm(x / 55 + 3, y / 55, 4) - 0.32) * 13;
      for (const [cx, cy, rx, ry, a] of SERRAS) {
        const q = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (q < 1) h += suave(1, 0.1, q) * suave(2, 22, d) * (a * (0.18 + 1.05 * crista(x / 21, y / 21)) + (crista(x / 6.5 + 31, y / 6.5) - 0.55) * a * 0.17);
      }
      const rv = Math.hypot(x - VULCAO[0], (y - VULCAO[1]) * 1.08);
      if (rv < 40) {
        const k = 1 - rv / 40;
        h += Math.pow(k, 1.35) * 44 * suave(0, 8, d) + (crista(Math.atan2(y - VULCAO[1], x - VULCAO[0]) * 4, rv / 22) - 0.5) * 6 * k;
        h += 6.5 * Math.exp(-Math.pow((rv - 9) / 3.2, 2)) * suave(0, 8, d);
        if (rv < 8) h -= (8 - rv) * 1.35;
      }
      return Math.max(h, 0.15);
    }
    const planos = nomes.map(n => {
      const [x, y] = SPOTS[n];
      if (n === 'Kanto') return { n, x, y, h: 13, r: 25, borda: 8 };
      if (n === 'Cinnabar') return { n, x: x - 20, y: y + 10, h: 3, r: 12, borda: 10 };
      return { n, x, y, h: clamp(relevoNatural(x, y), 2.6, 6.5), r: 30, borda: 16 };
    });
    function altura(x, y) {
      let h = relevoNatural(x, y);
      for (const p of planos) {
        const q = Math.hypot(x - p.x, (y - p.y) * 1.15);
        if (q < p.r + p.borda) h = mix(h, p.h, suave(p.r + p.borda, p.r, q) * (litoral(x, y) > 1 ? 1 : 0));
      }
      if (h > 0) {
        const dr = linhaDist(x, y, rio);
        if (dr < 14) h = mix(h, Math.min(h, 1.1), suave(14, 4, dr));
        for (const [cx, cy, rx, ry] of LAGOS) { const q = Math.hypot((x - cx) / rx, (y - cy) / ry); if (q < 1.6) h = mix(h, Math.min(h, 1.1), suave(1.6, 1, q)); }
        const ds = linhaDist(x, y, rota);
        if (ds < 8) h = mix(h, Math.min(h, 12), suave(8, 3, ds));
      }
      return h;
    }

    // malha do terreno
    const passo = 1.5, nx = Math.round(DOM.w / passo) + 1, ny = Math.round(DOM.h / passo) + 1;
    const alt = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) alt[j * nx + i] = altura(DOM.x0 + i * passo, DOM.y0 + j * passo);
    const em = (i, j) => alt[clamp(j, 0, ny - 1) * nx + clamp(i, 0, nx - 1)];
    const chao = (x, y) => {
      const fx = (x - DOM.x0) / passo, fy = (y - DOM.y0) / passo, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      return mix(mix(em(i, j), em(i + 1, j), u), mix(em(i, j + 1), em(i + 1, j + 1), u), v);
    };
    const verts = new Float32Array(nx * ny * 10);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = DOM.x0 + i * passo, y = DOM.y0 + j * passo, h = em(i, j);
      const gx = (em(i + 1, j) - em(i - 1, j)) / (2 * passo), gy = (em(i, j + 1) - em(i, j - 1)) / (2 * passo), n = Math.hypot(gx, 1, gy);
      let media = 0; for (const [a, b] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-4, -4], [4, 4], [-4, 4], [4, -4]]) media += em(i + a, j + b);
      const ao = clamp(1 - Math.max(0, media / 8 - h) * 0.11, 0.5, 1);
      let calcado = 0, mata = 0;
      for (const p of planos) {
        const piso = D.PISO[p.n]; if (!piso) continue;
        const [raio, forca] = piso, q = Math.hypot(x - p.x, (y - p.y) * 1.35);
        calcado = Math.max(calcado, suave(raio + 3, raio - 1, q) * forca);
      }
      for (const [cx, cy, rx, ry, , tipo] of BOSQUES) if (tipo === 'pinho' || tipo === 'copa') mata = Math.max(mata, suave(1.25, 0.7, Math.hypot((x - cx) / rx, (y - cy) / ry)));
      const savana = suave(1.2, 0.75, Math.hypot((x - SAFARI[0]) / 44, (y - SAFARI[1]) / 34));
      verts.set([wx(x), h, wz(y), -gx / n, 1 / n, -gy / n, calcado, mata, ao, savana], (j * nx + i) * 10);
    }
    const indices = new Uint32Array((nx - 1) * (ny - 1) * 6);
    for (let j = 0, k = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++, k += 6) { const a = j * nx + i; indices.set([a, a + nx, a + 1, a + 1, a + nx, a + nx + 1], k); }

    // máscaras pintadas: vermelho = estrada, verde = plantação, azul = rio e lago
    const sp = document.createElement('canvas'); sp.width = DOM.w * 2; sp.height = DOM.h * 2;
    const s = sp.getContext('2d');
    s.fillStyle = '#000'; s.fillRect(0, 0, sp.width, sp.height);
    s.scale(2, 2); s.translate(-DOM.x0, -DOM.y0); s.globalCompositeOperation = 'lighter'; s.lineCap = s.lineJoin = 'round';
    const traco = (l, cor, larg) => { s.strokeStyle = cor; s.lineWidth = larg; s.beginPath(); l.forEach((p, i) => s[i ? 'lineTo' : 'moveTo'](p[0], p[1])); s.stroke(); };
    for (const l of [rota, ramal]) { traco(l, 'rgb(90,0,0)', 5.6); traco(l, 'rgb(165,0,0)', 3.4); }
    for (const [cx, cy, w, h, a] of CAMPOS) { s.save(); s.translate(cx, cy); s.rotate(a); s.fillStyle = 'rgb(0,255,0)'; s.fillRect(-w / 2, -h / 2, w / 2 - 0.7, h); s.fillStyle = 'rgb(0,170,0)'; s.fillRect(0.7, -h / 2, w / 2 - 0.7, h); s.restore(); }
    const kit = { malha, rng: rng(5150), fbm, wx, wz, chao, litoral, linhaDist, segDist, rota, rio, SPOTS, LAGOS, CAMPOS, VULCAO, ocupado: [], baforadas: [] };
    kit.baforada = (x, y, z, tam, n, alfa) => { for (let i = 0; i < n; i++) kit.baforadas.push(x, y, z, tam, (i / n + Math.abs(x) * 0.013) % 1, alfa); };
    D.pintar(s, kit);
    // água num desenho à parte: margem clara por fora e mais funda no meio
    const ag = document.createElement('canvas'); ag.width = sp.width; ag.height = sp.height;
    const a = ag.getContext('2d'); a.fillStyle = '#000'; a.fillRect(0, 0, ag.width, ag.height); a.scale(2, 2); a.translate(-DOM.x0, -DOM.y0); a.lineCap = a.lineJoin = 'round';
    const risco = (l, v, larg) => { a.strokeStyle = `rgb(0,0,${v})`; a.lineWidth = larg; a.beginPath(); l.forEach((p, i) => a[i ? 'lineTo' : 'moveTo'](p[0], p[1])); a.stroke(); };
    const lago = (cx, cy, rx, ry) => { a.beginPath(); a.ellipse(cx, cy, rx, ry, 0, 0, 7); a.fill(); };
    risco(rio, 50, 11.5);
    for (const [cx, cy, rx, ry] of LAGOS) { a.fillStyle = 'rgb(0,0,50)'; lago(cx, cy, rx * 1.3, ry * 1.34); }
    risco(rio, 118, 7.6); risco(rio, 150, 5.4); risco(rio, 190, 2.8);
    for (const [cx, cy, rx, ry] of LAGOS) for (let i = 0; i <= 9; i++) { const k = 1.06 - i * 0.09; a.fillStyle = `rgb(0,0,${118 + i * 13})`; lago(cx, cy, rx * k, ry * k); }
    s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = 'lighter'; s.drawImage(ag, 0, 0);

    const obras = construir(nomes, planos, chao, rota, kit);
    const arvores = plantar(planos, chao, rota, rio, kit.ocupado);
    return { nx, ny, alt, verts, indices, splat: sp, chao, planos, rota, obras, arvores, baforadas: kit.baforadas, barulho: texturaRuido() };
  }

  function texturaRuido() {
    const N = 256, d = new Uint8Array(N * N * 4);
    const val = (x, y, f) => { // ruído que se repete sem emenda
      const fx = x / N * f, fy = y / N * f, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const h = (a, b) => hash((a % f) + f * 31, (b % f) + f * 17);
      return mix(mix(h(i, j), h(i + 1, j), su), mix(h(i, j + 1), h(i + 1, j + 1), su), sv);
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 4; c++) {
      const f = [4, 8, 16, 32][c];
      d[(y * N + x) * 4 + c] = 255 * (val(x, y, f) * 0.57 + val(x, y, f * 2) * 0.29 + val(x, y, f * 4) * 0.14);
    }
    return { N, d };
  }

  // ── peças 3D ──────────────────────────────────────────────────
  // cada vértice: posição, normal, cor, uv, material (0 comum, 1 janelas, 2 brilho próprio, 3 bandeira, 4 água, 5 facho, 6 luz de noite)
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cor = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  function malha() {
    const v = [];
    const m = {
      v,
      ponto(p, n, c, uv, mat) { v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], uv[0], uv[1], mat); },
      tri(a, b, c, k, opts) {
        const o = opts || {};
        let n = norm(cruz(sub(b, a), sub(c, a)));
        if (o.centro) { const g = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], r = sub(g, o.centro); if (n[0] * r[0] + n[1] * r[1] + n[2] * r[2] < 0) n = [-n[0], -n[1], -n[2]]; }
        const ns = o.normais || [n, n, n], uv = o.uv || [[0, 0], [0, 0], [0, 0]], c3 = typeof k === 'string' ? cor(k) : k;
        [a, b, c].forEach((p, i) => m.ponto(p, ns[i], c3, uv[i], o.mat || 0));
      },
      quad(a, b, c, d, k, opts) {
        const o = opts || {}, uv = o.uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
        m.tri(a, b, c, k, { ...o, uv: [uv[0], uv[1], uv[2]] }); m.tri(a, c, d, k, { ...o, uv: [uv[0], uv[2], uv[3]] });
      },
      caixa(x, y, z, w, h, d, k, opts) {
        const o = opts || {}, a = o.giro || 0, ca = Math.cos(a), sa = Math.sin(a);
        const p = (dx, dy, dz) => [x + dx * ca - dz * sa, y + dy, z + dx * sa + dz * ca];
        const centro = p(0, h / 2, 0), W = w / 2, D = d / 2;
        const face = (q, larg) => { const j = o.janelas; m.quad(q[0], q[1], q[2], q[3], k, { centro, mat: j ? 1 : o.mat || 0, uv: j ? [[0, 0], [larg / j[0], 0], [larg / j[0], h / j[1]], [0, h / j[1]]] : undefined }); };
        face([p(-W, 0, D), p(W, 0, D), p(W, h, D), p(-W, h, D)], w); face([p(W, 0, -D), p(-W, 0, -D), p(-W, h, -D), p(W, h, -D)], w);
        face([p(W, 0, D), p(W, 0, -D), p(W, h, -D), p(W, h, D)], d); face([p(-W, 0, -D), p(-W, 0, D), p(-W, h, D), p(-W, h, -D)], d);
        m.quad(p(-W, h, D), p(W, h, D), p(W, h, -D), p(-W, h, -D), o.topo || k, { centro, mat: o.mat || 0 });
      },
      telhado(x, y, z, w, d, h, k, opts) {
        const o = opts || {}, W = w / 2, D = d / 2, a = o.giro || 0, ca = Math.cos(a), sa = Math.sin(a);
        const p = (dx, dy, dz) => [x + dx * ca - dz * sa, y + dy, z + dx * sa + dz * ca], c = p(0, h * 0.3, 0);
        m.quad(p(-W, 0, D), p(W, 0, D), p(W, h, 0), p(-W, h, 0), k, { centro: c, mat: o.mat }); m.quad(p(W, 0, -D), p(-W, 0, -D), p(-W, h, 0), p(W, h, 0), k, { centro: c, mat: o.mat });
        m.tri(p(W, 0, D), p(W, 0, -D), p(W, h, 0), o.lado || k, { centro: c }); m.tri(p(-W, 0, -D), p(-W, 0, D), p(-W, h, 0), o.lado || k, { centro: c });
      },
      tubo(x, y, z, r0, r1, h, seg, k, opts) {
        const o = opts || {}, incl = (r0 - r1) / (h || 1);
        for (let i = 0; i < seg; i++) {
          const a = i / seg * 6.2832, b = (i + 1) / seg * 6.2832;
          const P = (t, r, yy) => [x + Math.cos(t) * r, y + yy, z + Math.sin(t) * r * (o.achata || 1)], N = t => norm([Math.cos(t), incl, Math.sin(t)]);
          m.tri(P(a, r0, 0), P(b, r0, 0), P(b, r1, h), k, { normais: [N(a), N(b), N(b)], mat: o.mat });
          if (r1 > 0.001) m.tri(P(a, r0, 0), P(b, r1, h), P(a, r1, h), k, { normais: [N(a), N(b), N(a)], mat: o.mat });
          if (o.tampa && r1 > 0.001) m.tri([x, y + h, z], P(a, r1, h), P(b, r1, h), o.tampa, { normais: [[0, 1, 0], [0, 1, 0], [0, 1, 0]], mat: o.matTampa });
        }
      },
      bola(x, y, z, rx, ry, rz, k, semente, aspero, nivel, mat) {
        const t = (1 + Math.sqrt(5)) / 2;
        let vs = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
        let fs = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
        const tris = [];
        for (const f of fs) { const [a, b, c] = f.map(i => vs[i]); if (nivel === 0) { tris.push([a, b, c]); continue; } const meio = (p, q) => norm([p[0] + q[0], p[1] + q[1], p[2] + q[2]]), ab = meio(a, b), bc = meio(b, c), ca = meio(c, a); tris.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
        const P = n => { const j = 1 + (hash(Math.round(n[0] * 97) + semente, Math.round(n[1] * 89 + n[2] * 53)) - 0.5) * (aspero || 0); return [x + n[0] * rx * j, y + n[1] * ry * j, z + n[2] * rz * j]; };
        for (const f of tris) m.tri(P(f[0]), P(f[1]), P(f[2]), k, { normais: f.map(n => norm([n[0] / rx, n[1] / ry, n[2] / rz])), mat });
      },
    };
    return m;
  }

  function construir(nomes, planos, chao, rota, kit) {
    const m = malha(), facho = malha();
    kit.m = m;
    const r = rng(97);
    const no = (mx, my) => ({ x: wx(mx), y: Math.max(chao(mx, my), 0) - 0.3, z: wz(my) });
    const casa = (mx, my, w, h, d, parede, telha, giro) => { const p = no(mx, my); D.casa(kit, p.x, p.y, p.z, { w, h, d, parede, telha, giro }); };
    const bandeira = (x, y, z, k, alt) => {
      m.tubo(x, y, z, 0.3, 0.22, alt, 5, '#e8e8ee');
      for (let i = 0; i < 6; i++) { const a = i / 6, b = (i + 1) / 6, T = y + alt;
        m.quad([x + a * 6, T - 3.6 + a, z], [x + b * 6, T - 3.6 + b, z], [x + b * 6, T - b * 0.6, z], [x + a * 6, T - a * 0.6, z], k, { mat: 3, uv: [[a, 0], [b, 0], [b, 1], [a, 1]] }); }
    };
    const P = n => SPOTS[n];
    for (const nome of nomes) {
      const [cx, cy] = P(nome), inicio = m.v.length, meio = [wx(cx), Math.max(chao(cx, cy), 0), wz(cy - 4)];
      if (nome === 'Pewter') { // museu de colunas e pedreira
        const p = no(cx - 2, cy - 4);
        m.caixa(p.x, p.y, p.z, 30, 1.6, 17, '#d8d1c0'); m.caixa(p.x, p.y + 1.6, p.z, 27, 1.2, 14.5, '#e6e0d0');
        m.caixa(p.x, p.y + 2.8, p.z - 2, 22, 10, 8, '#8d7f68', { janelas: [3.2, 4.5] });
        for (let i = 0; i < 7; i++) m.tubo(p.x - 11.4 + i * 3.8, p.y + 2.8, p.z + 5, 0.95, 0.8, 9.4, 8, '#f4efe2');
        m.caixa(p.x, p.y + 12.2, p.z, 27, 1.6, 15, '#eee8d9');
        m.telhado(p.x, p.y + 13.8, p.z, 27, 15, 6.4, '#9a5b40', { lado: '#e8e0cc' });
        for (const [dx, dy, s] of [[-27, 2, 5.5], [-22, 9, 3.2], [24, 6, 4.6], [28, -3, 3], [-30, -9, 2.6], [20, 12, 2.2]]) { const q = no(cx + dx, cy + dy); m.bola(q.x, q.y + s * 0.4, q.z, s, s * 0.75, s * 0.9, '#8d857a', dx * 7 + 300, 0.55); }
        casa(cx + 17, cy - 8, 8, 6, 7, '#d9d0c2', '#7c736a', 0.3);
      } else if (nome === 'Cerulean') { // casas de telhado azul e fonte
        casa(cx - 14, cy - 5, 10, 7, 8, '#f2ede0', '#2f68b8', 0.2); casa(cx + 2, cy - 11, 9, 6.5, 7, '#eef0f4', '#3f86d6', -0.25);
        casa(cx + 16, cy - 3, 8, 6, 7, '#f4eee2', '#2f68b8', 0.45); casa(cx - 20, cy + 6, 7, 5, 6, '#e9eef5', '#5aa0e0', -0.1);
        const p = no(cx + 2, cy + 1);
        m.tubo(p.x, p.y, p.z, 6.4, 6.2, 1.5, 20, '#e8e6e0', { tampa: '#3fa9d8', matTampa: 4 }); m.tubo(p.x, p.y + 1.4, p.z, 0.9, 0.7, 4, 8, '#e8e6e0'); m.bola(p.x, p.y + 6, p.z, 1.5, 1.1, 1.5, '#cdeeff', 5, 0.2);
      } else if (nome === 'Vermilion') { // porto: píer, navio e farol
        casa(cx - 17, cy - 3, 11, 7, 8, '#f3e8d8', '#d9702d', 0.15); casa(cx - 6, cy - 14, 8, 6, 7, '#efe6da', '#c85f26', -0.2); casa(cx + 12, cy - 12, 7, 5.5, 6, '#f6efe2', '#e0823c', 0.35);
        const f = no(cx + 5, cy - 1);
        m.tubo(f.x, f.y, f.z, 4.4, 4, 2.4, 14, '#bcb4a4', { tampa: '#cfc8ba' });
        for (let i = 0; i < 5; i++) m.tubo(f.x, f.y + 2.4 + i * 4.4, f.z, 3.2 - i * 0.22, 2.98 - i * 0.22, 4.4, 14, i % 2 ? '#c83c34' : '#f5f2ea');
        m.tubo(f.x, f.y + 24.4, f.z, 3, 3, 0.9, 14, '#3a3f4c', { tampa: '#3a3f4c' }); m.tubo(f.x, f.y + 25.3, f.z, 1.7, 1.7, 3, 10, '#ffe58a', { mat: 6 }); m.tubo(f.x, f.y + 28.3, f.z, 2.4, 0, 2.8, 12, '#a3302a');
        const topo = [f.x, f.y + 26.8, f.z];
        facho.tri([0, 0, 0], [70, -4, -9], [70, -4, 9], '#fff2bd', { mat: 5, uv: [[0, 0], [1, 0], [1, 1]] });
        facho.origem = topo;
        for (let i = 0; i < 12; i++) m.caixa(wx(cx + 18 + i * 2.6), 1.5, wz(cy + 12), 2.4, 0.7, 6, i % 2 ? '#8a5c37' : '#9b6c42');
        for (let i = 0; i < 4; i++) for (const lado of [-2.6, 2.6]) m.tubo(wx(cx + 22 + i * 8), -5, wz(cy + 12) + lado, 0.7, 0.7, 7, 6, '#5d3f27');
      } else if (nome === 'Celadon') { // loja de departamentos e jardins
        const p = no(cx - 5, cy - 6);
        m.caixa(p.x, p.y, p.z, 21, 24, 13, '#d7e6cf', { janelas: [3, 3.4], topo: '#9fb596' }); m.caixa(p.x, p.y, p.z + 7.4, 24, 4.5, 3, '#3f8f55');
        m.caixa(p.x - 3, p.y + 24, p.z, 9, 3, 7, '#c5d6bd', { topo: '#8aa384' }); m.caixa(p.x + 5, p.y + 24, p.z + 3, 8, 4.5, 0.8, '#2f7d4a'); m.tubo(p.x - 7, p.y + 24, p.z - 3, 1.5, 1.5, 3, 8, '#8f979d', { tampa: '#7a8288' });
        casa(cx + 17, cy - 2, 9, 6, 7, '#f1ecdc', '#3f9a50', -0.3); casa(cx + 12, cy - 15, 8, 5.5, 6, '#ece7d6', '#5cb066', 0.25); casa(cx - 24, cy - 2, 7, 5, 6, '#f3eee0', '#3f9a50', 0.1);
        for (let i = 0; i < 60; i++) { const q = no(cx + 2 + r() * 22, cy + 3 + r() * 8); m.bola(q.x, q.y + 0.8, q.z, 1.1, 0.8, 1.1, ['#e8508a', '#f4d84a', '#f5f2ee', '#f0803c', '#8f5fd0'][i % 5], i, 0.3); }
        const q = no(cx - 14, cy + 6); m.tubo(q.x, q.y, q.z, 5.5, 5.3, 0.9, 16, '#d9d4c8', { tampa: '#3f9ec8', matTampa: 4 });
      } else if (nome === 'Fuchsia') { // safári
        const p = no(cx + 14, cy + 1);
        for (const dx of [-9, 9]) { m.caixa(p.x + dx, p.y, p.z, 3, 15, 3, '#8a5a30'); m.bola(p.x + dx, p.y + 20.5, p.z, 1.6, 1.6, 1.6, '#d9a441', 3, 0.1); }
        m.caixa(p.x, p.y + 13, p.z, 25, 5, 2.2, '#6f4524'); m.caixa(p.x, p.y + 14.2, p.z + 1.2, 17, 2.6, 0.5, '#f2d27a'); m.telhado(p.x, p.y + 18, p.z, 27, 5, 2.6, '#a9672f');
        const t = no(cx - 14, cy - 2); m.tubo(t.x, t.y, t.z, 10, 10, 4, 14, '#f1d8e8'); for (let i = 0; i < 14; i++) { const a = i / 14 * 6.2832, b = (i + 1) / 14 * 6.2832; m.tri([t.x + Math.cos(a) * 11.5, t.y + 4, t.z + Math.sin(a) * 11.5], [t.x + Math.cos(b) * 11.5, t.y + 4, t.z + Math.sin(b) * 11.5], [t.x, t.y + 14, t.z], i % 2 ? '#b0407f' : '#f4e6ef', { centro: [t.x, t.y, t.z] }); } bandeira(t.x, t.y + 13.4, t.z, '#ffd166', 5);
        casa(cx - 2, cy - 15, 8, 5, 6, '#efdcc0', '#b94f94', 0.2);
      } else if (nome === 'Saffron') { // centro com arranha-céus
        const predio = (dx, dy, w, h, d, k) => { const q = no(cx + dx, cy + dy); m.caixa(q.x, q.y, q.z, w, h, d, k, { janelas: [2, 2.6], topo: '#8b8f98' }); m.caixa(q.x - w * 0.15, q.y + h, q.z, w * 0.45, 1.8, d * 0.5, '#aeb2ba'); return { q, h }; };
        const alto = predio(-4, -9, 11, 42, 10, '#8fb2d0'); predio(-19, -3, 10, 27, 9, '#d9c093'); predio(11, -2, 10, 32, 9, '#d8a58c'); predio(23, 3, 8, 17, 8, '#cfc8bc'); predio(-24, -15, 8, 19, 7, '#a9bcc9'); predio(9, -18, 8, 24, 7, '#bcb0cc'); predio(-9, 4, 7, 12, 7, '#e0d6c2'); predio(21, -13, 7, 14, 7, '#9fc0b8');
        m.tubo(alto.q.x, alto.q.y + alto.h + 1.8, alto.q.z, 0.5, 0.15, 12, 6, '#d8dbe2'); m.bola(alto.q.x, alto.q.y + alto.h + 14, alto.q.z, 0.9, 0.9, 0.9, '#ff4a3d', 1, 0);
      } else if (nome === 'Cinnabar') { // vila na ilha e cratera acesa
        casa(cx - 22, cy + 8, 9, 6, 7, '#efe0cc', '#c4551f', 0.25); casa(cx - 30, cy + 18, 7, 5, 6, '#e9dcc8', '#a8461a', -0.2); casa(cx - 8, cy + 24, 7, 5, 6, '#f1e4d0', '#d96a28', 0.1);
        const q = no(VULCAO[0], VULCAO[1]); m.tubo(q.x, q.y + 0.8, q.z, 5.2, 5.2, 0.6, 18, '#c92800', { mat: 2, tampa: '#e8520a', matTampa: 2 });
      } else if (nome === 'Viridian') { // vila no meio da floresta
        casa(cx - 13, cy - 2, 11, 7, 8, '#e9dcc2', '#a34a35', 0.2); casa(cx + 6, cy - 9, 9, 6.5, 7, '#e4dccb', '#7d5fae', -0.3); casa(cx + 15, cy + 4, 8, 5.5, 6, '#efe5cd', '#bb7e2c', 0.4); casa(cx - 1, cy + 5, 7, 5, 6, '#e6d8bd', '#8f4130', -0.1); casa(cx - 17, cy - 15, 7, 5, 6, '#eadfc6', '#7d5fae', 0.15);
        const q = no(cx + 22, cy - 12); m.tubo(q.x, q.y, q.z, 3, 2.6, 13, 10, '#cdbfa6'); m.tubo(q.x, q.y + 13, q.z, 3.8, 0, 6.5, 10, '#8f4130');
      } else if (nome === 'Kanto') { // estádio do campeonato
        const p = no(cx, cy - 4);
        const anel = (r0, r1, y0, y1, k, mat) => { const N = 36; for (let i = 0; i < N; i++) { const a = i / N * 6.2832, b = (i + 1) / N * 6.2832, Q = (t, rr, yy) => [p.x + Math.cos(t) * rr, p.y + yy, p.z + Math.sin(t) * rr * 0.66];
          const nn = t => norm([Math.cos(t) * (y1 - y0), -(r1 - r0), Math.sin(t) * (y1 - y0) * 1.5]); const cima = y1 === y0;
          m.tri(Q(a, r0, y0), Q(b, r0, y0), Q(b, r1, y1), k, { normais: cima ? [[0, 1, 0], [0, 1, 0], [0, 1, 0]] : [nn(a), nn(b), nn(b)], mat }); m.tri(Q(a, r0, y0), Q(b, r1, y1), Q(a, r1, y1), k, { normais: cima ? [[0, 1, 0], [0, 1, 0], [0, 1, 0]] : [nn(a), nn(b), nn(a)], mat }); } };
        anel(24, 24, 0, 11, '#e9e4f2'); anel(24, 22, 11, 11, '#cfc4e6'); anel(22, 14, 11, 2.2, '#8f7fb8'); anel(14, 0, 2, 2, '#4f9a45'); anel(8, 7.4, 2.15, 2.15, '#eef4ee');
        for (let i = 0; i < 18; i++) { const a = i / 18 * 6.2832; m.caixa(p.x + Math.cos(a) * 24.2, p.y + 1.5, p.z + Math.sin(a) * 24.2 * 0.66, 2.6, 6.5, 0.9, '#4c3f73', { giro: a + 1.5708 }); }
        ['#e0463f', '#4f7fe8', '#f2c52c', '#58b84a'].forEach((k, i) => { const a = 0.75 + i * 1.5708; bandeira(p.x + Math.cos(a) * 23, p.y + 11, p.z + Math.sin(a) * 15.2, k, 10); });
        const T = [p.x, p.y + 2, p.z - 24]; m.caixa(T[0], T[1] - 2, T[2], 6, 14, 5, '#cfc6b4'); m.tubo(T[0], T[1] + 12, T[2], 1.4, 1.1, 3, 10, '#d99a1f'); m.tubo(T[0], T[1] + 15, T[2], 1.1, 4.4, 5, 14, '#ffca38', { tampa: '#e0a51f' });
      }
      const aumento = nome === 'Cinnabar' || nome === 'Vermilion' ? 1 : nome === 'Kanto' ? 1.08 : nome === 'Fuchsia' ? 0.9 : 1.15;
      if (aumento !== 1) for (let i = inicio; i < m.v.length; i += 12) for (let k = 0; k < 3; k++) m.v[i + k] = meio[k] + (m.v[i + k] - meio[k]) * aumento;
    }
    // pontes onde a estrada passa sobre o mar
    for (let i = 1; i < rota.length; i++) {
      const [ax, ay] = rota[i - 1], [bx, by] = rota[i], L = Math.hypot(bx - ax, by - ay), giro = Math.atan2(by - ay, bx - ax), n = Math.ceil(L / 4);
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = mix(ax, bx, t), y = mix(ay, by, t);
        if (chao(x, y) > 0.9) continue;
        m.caixa(wx(x), 1.4, wz(y), L / n + 0.25, 0.8, 5.4, '#c9bca0', { giro });
        for (const lado of [-2.5, 2.5]) m.caixa(wx(x) - Math.sin(giro) * lado, 2.2, wz(y) + Math.cos(giro) * lado, L / n + 0.25, 0.7, 0.45, '#8d7d62', { giro });
        if (k % 3 === 0) m.tubo(wx(x), -8, wz(y), 1, 0.85, 9.6, 7, '#8f8672');
      }
    }
    // pedras soltas nas encostas
    for (let i = 0, n = 0; i < 1200 && n < 130; i++) {
      const x = 20 + r() * 320, y = 40 + r() * 400, h = chao(x, y);
      if (h < 11 || h > 32 || Math.hypot(x - VULCAO[0], y - VULCAO[1]) < 42) continue;
      const s = 0.8 + r() * 1.9; m.bola(wx(x), h + s * 0.2, wz(y), s, s * 0.8, s, r() < 0.5 ? '#5f574d' : '#6f675c', i, 0.7, 0); n++;
    }
    // barcos (a mesma peça, desenhada em três lugares)
    const barco = malha();
    barco.tri([-9, 1.6, -3], [11, 1.6, 0], [-9, 1.6, 3], '#d8c3a0', { centro: [0, -5, 0] });
    barco.quad([-9, 1.6, 3], [11, 1.6, 0], [7, -1.2, 0], [-8, -1.2, 1.8], '#8a4a2a', { centro: [0, 0, -6] }); barco.quad([-9, 1.6, -3], [11, 1.6, 0], [7, -1.2, 0], [-8, -1.2, -1.8], '#8a4a2a', { centro: [0, 0, 6] }); barco.quad([-9, 1.6, 3], [-8, -1.2, 1.8], [-8, -1.2, -1.8], [-9, 1.6, -3], '#71391f', { centro: [4, 0, 0] });
    barco.tubo(0, 1.6, 0, 0.35, 0.25, 15, 5, '#e8e0d0'); barco.tri([-0.4, 15.5, 0], [-0.4, 4, 0], [-8.5, 4, 1.2], '#f6f3ea', { mat: 3 }); barco.tri([0.4, 13, 0], [0.4, 4, 0], [8, 4, 0.6], '#e8574a', { mat: 3 });
    const navio = malha();
    navio.caixa(0, -1, 0, 28, 4.4, 11, '#c9413a', { topo: '#e9e4da' }); navio.tri([14, 3.4, -5.5], [23, 3.4, 0], [14, 3.4, 5.5], '#e9e4da', { centro: [14, -5, 0] }); navio.quad([14, 3.4, 5.5], [23, 3.4, 0], [21, -1, 0], [14, -1, 5.5], '#c9413a', { centro: [10, 0, -4] }); navio.quad([14, 3.4, -5.5], [23, 3.4, 0], [21, -1, 0], [14, -1, -5.5], '#c9413a', { centro: [10, 0, 4] });
    navio.caixa(-4, 3.4, 0, 15, 5, 8, '#f5f2ea', { janelas: [2.2, 2.5] }); navio.caixa(-6, 8.4, 0, 9, 3.4, 6, '#f5f2ea', { janelas: [2.2, 1.8] }); navio.tubo(-9, 11.8, 0, 1.8, 1.6, 5.5, 10, '#2e3240', { tampa: '#15171d' });
    const enfeites = D.montar(kit);
    return { ...enfeites, fixo: new Float32Array(m.v), barco: new Float32Array(barco.v), navio: new Float32Array(navio.v), facho: new Float32Array(facho.v), farol: facho.origem || [0, 0, 0] };
  }

  function modelosArvore() {
    const pinho = malha(); pinho.tubo(0, 0, 0, 0.55, 0.4, 2, 5, '#5c4028');
    [[1.1, 2.9, 3.1, '#23492c'], [2.5, 2.45, 2.9, '#285231'], [3.9, 2.0, 2.7, '#2c5a34'], [5.2, 1.5, 2.5, '#316238'], [6.4, 0.95, 2.1, '#376b3d']].forEach(([y, raio, alt, k], i) => { for (let j = 0; j < 8; j++) { const a = (j + i * 0.5) / 8 * 6.2832, b = (j + 1 + i * 0.5) / 8 * 6.2832, am = (a + b) / 2, R = raio * (1.12), r2 = raio * 0.7, n = t => norm([Math.cos(t), 0.75, Math.sin(t)]); pinho.tri([Math.cos(a) * r2, y + 0.35, Math.sin(a) * r2], [Math.cos(am) * R, y - 0.25, Math.sin(am) * R], [0, y + alt, 0], k, { normais: [n(a), n(am), n(am)], mat: 13 }); pinho.tri([Math.cos(am) * R, y - 0.25, Math.sin(am) * R], [Math.cos(b) * r2, y + 0.35, Math.sin(b) * r2], [0, y + alt, 0], k, { normais: [n(am), n(b), n(am)], mat: 13 }); } });
    const copa = malha(); copa.tubo(0, 0, 0, 0.6, 0.42, 3, 5, '#654830'); copa.bola(0, 4.5, 0, 2.2, 2.0, 2.2, '#315926', 11, 0.3, 1, 13);
    [[1.7, 4.3, 0.6, 1.45, '#3a672c'], [-1.5, 4.5, 1.0, 1.4, '#44742f'], [-0.6, 4.1, -1.7, 1.45, '#335e29'], [0.7, 6.1, 0.4, 1.55, '#4d7e34'], [-1.1, 5.7, -0.5, 1.25, '#416f2d'], [1.1, 5.2, -1.2, 1.15, '#487831'], [0.2, 4.7, 1.8, 1.2, '#3f6d2c']].forEach(([x, y, z, t, k], i) => copa.bola(x, y, z, t, t * 0.85, t, k, 40 + i * 7, 0.75, 0, 13));
    const acacia = malha(); acacia.tubo(0, 0, 0, 0.55, 0.35, 5, 5, '#6a4b30'); acacia.bola(0, 5.8, 0, 3.4, 1.0, 3, '#5f6b2a', 31, 0.3, 1, 13); [[2.8, 5.7, 0.8], [-2.9, 5.9, -0.3], [0.4, 6.4, -2.2], [-0.8, 5.8, 2.4], [1.2, 6.5, 1.0]].forEach(([x, y, z], i) => acacia.bola(x, y, z, 1.8, 0.75, 1.6, i % 2 ? '#76842f' : '#697732', 60 + i * 5, 0.6, 0, 13));
    const palmeira = malha(); palmeira.tubo(0, 0, 0, 0.6, 0.46, 3.5, 6, '#8a6438'); palmeira.tubo(0.3, 3.4, 0, 0.46, 0.34, 3.4, 6, '#97703f');
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.2832, c = Math.cos(a), s = Math.sin(a), q = (d, y, l) => [0.4 + c * d - s * l, y, s * d + c * l];
      palmeira.tri([0.4, 6.9, 0], q(2.6, 7.7, 1), q(2.6, 7.7, -1), '#3f7f34', { centro: [0, 0, 0] }); palmeira.tri(q(2.6, 7.7, 1), q(5.6, 5.6, 0), q(2.6, 7.7, -1), '#356f2c', { centro: [0, 0, 0] }); }
    return { pinho, copa, acacia, palmeira };
  }
  function plantar(planos, chao, rota, rio, ocupado) {
    const modelos = modelosArvore(), r = rng(1234), lugares = { pinho: [], copa: [], acacia: [], palmeira: [] };
    const livre = (x, y, tipo) => {
      const h = chao(x, y);
      if (h < (tipo === 'palmeira' ? 0.7 : 1.7) || h > 25) return null;
      if (Math.hypot(chao(x + 2, y) - chao(x - 2, y), chao(x, y + 2) - chao(x, y - 2)) / 4 > 0.8) return null;
      if (linhaDist(x, y, rota) < 5.5 || linhaDist(x, y, rio) < 6.5 || segDist(x, y, 88, 424, 48, 418) < 4) return null;
      if (LAGOS.some(([cx, cy, rx, ry]) => Math.hypot((x - cx) / (rx + 4), (y - cy) / (ry + 4)) < 1)) return null;
      if (ocupado.some(([a, b, c]) => Math.abs(x - a) < c + 2.6 && Math.hypot(x - a, y - b) < c + 2.2)) return null;
      if (CAMPOS.some(([cx, cy, w, hh]) => Math.abs(x - cx) < w / 2 + 3 && Math.abs(y - cy) < hh / 2 + 3)) return null;
      if (Math.hypot(x - VULCAO[0], y - VULCAO[1]) < 24) return null;
      return h;
    };
    const por = (tipo, x, y, s) => {
      const h = livre(x, y, tipo); if (h === null) return false;
      const t = 0.82 + r() * 0.36;
      lugares[tipo].push(wx(x), h - 0.35, wz(y), s * (0.72 + r() * 0.5), t * (0.9 + r() * 0.25), t, t * (0.85 + r() * 0.25), r() * 6.28);
      return true;
    };
    for (const [cx, cy, rx, ry, n, tipo] of BOSQUES) for (let i = 0, ok = 0; i < n * 3 && ok < n; i++) { const a = r() * 6.2832, d = Math.sqrt(r()); if (por(tipo, cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 1)) ok++; }
    for (let i = 0, ok = 0; i < 9000 && ok < 950; i++) { // árvores espalhadas, em tufos
      const x = 22 + r() * 316, y = 44 + r() * 330;
      if (fbm(x / 26 + 9, y / 26, 3) < 0.52) continue;
      if (por(chao(x, y) > 9 || y < 110 ? 'pinho' : 'copa', x, y, 0.82)) ok++;
    }
    return Object.entries(lugares).map(([tipo, l]) => ({ tipo, vertices: new Float32Array(modelos[tipo].v), instancias: new Float32Array(l), n: l.length / 8 }));
  }

  // ── programas da placa de vídeo ───────────────────────────────
  const COMUM = `#version 300 es
precision highp float; precision highp sampler2DShadow;
uniform vec3 uSol, uLuz, uCeu, uHorizonte, uCam; uniform float uTempo, uNoite; uniform mat4 uSombraVP;
uniform sampler2D uRuido; uniform sampler2DShadow uSombra;`;
  const LUZ = `
float sombra(vec3 p, vec3 n) {
  vec4 q = uSombraVP * vec4(p + n * 0.7, 1.0); vec3 s = q.xyz / q.w * 0.5 + 0.5;
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  float soma = 0.0; vec2 t = 1.0 / vec2(textureSize(uSombra, 0));
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) soma += texture(uSombra, vec3(s.xy + vec2(i, j) * t * 1.15, s.z - 0.0016));
  return soma / 9.0;
}
float nuvem(vec2 p) { return 1.0 - 0.42 * smoothstep(0.54, 0.74, texture(uRuido, (p + vec2(uTempo * 5.0, uTempo * 1.4)) / 330.0).r); }
vec3 revelar(vec3 c) { c *= 0.9; c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }`;

  const VS_TERRA = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec4 aExtra;
uniform mat4 uVP; out vec3 vP, vN; out vec4 vE;
void main() { vP = aPos; vN = aNor; vE = aExtra; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FS_TERRA = COMUM + `
uniform sampler2D uPintura; uniform vec4 uArea; uniform vec2 uVulcao;
in vec3 vP, vN; in vec4 vE; out vec4 cor;` + LUZ + `
void main() {
  vec2 p = vP.xz; float h = vP.y; vec3 N = normalize(vN);
  float n1 = texture(uRuido, p / 190.0).r, n2 = texture(uRuido, p / 70.0).g, n3 = texture(uRuido, p / 30.0).b, n4 = texture(uRuido, p / 17.0).a;
  float inclina = 1.0 - N.y;
  vec3 c = mix(vec3(0.19, 0.31, 0.12), vec3(0.37, 0.47, 0.19), smoothstep(0.32, 0.68, n2));
  c = mix(c, vec3(0.52, 0.47, 0.24), smoothstep(0.52, 0.78, n1) * 0.65);
  c = mix(c, vec3(0.24, 0.38, 0.13), smoothstep(0.5, 0.75, n3) * 0.5);
  c = mix(c, vec3(0.13, 0.23, 0.08), vE.y * 0.82);
  c = mix(c, mix(vec3(0.68, 0.56, 0.27), vec3(0.76, 0.66, 0.36), n3), vE.w);
  c *= 0.80 + 0.42 * n4;
  float miudo = texture(uRuido, p / 5.7).a, touceira = texture(uRuido, p.yx / 11.0 + 0.37).b;
  c *= 0.84 + 0.32 * miudo; c = mix(c, c * vec3(0.72, 0.86, 0.62), smoothstep(0.55, 0.75, touceira) * (1.0 - vE.x));
  float estrato = texture(uRuido, vec2(h / 21.0 + n3 * 0.35, (p.x + p.y) / 260.0)).b;
  vec3 rocha = mix(vec3(0.25, 0.21, 0.18), vec3(0.52, 0.45, 0.37), estrato) * (0.75 + 0.5 * n4);
  float r = max(smoothstep(0.17, 0.36, inclina + (n3 - 0.5) * 0.18), smoothstep(17.0, 27.0, h + (n2 - 0.5) * 16.0));
  float lado1 = texture(uRuido, vec2(p.x + p.y * 0.35, h * 2.2) / 21.0).a, lado2 = texture(uRuido, vec2(p.y - p.x * 0.35, h * 1.7) / 13.0).b;
  float aresta = smoothstep(0.0, 0.10, abs(lado1 - 0.5)) ;
  rocha *= mix(1.0, (0.55 + 0.9 * lado2) * (0.72 + 0.28 * aresta), smoothstep(0.18, 0.5, inclina));
  c = mix(c, rocha, r);
  float neve = smoothstep(30.0, 37.0, h + (n3 - 0.5) * 15.0) * (1.0 - smoothstep(0.42, 0.72, inclina));
  c = mix(c, vec3(0.93, 0.95, 0.99), neve);
  float areia = smoothstep(3.0, 1.3, h + (n3 - 0.5) * 2.2);
  c = mix(c, mix(vec3(0.84, 0.74, 0.50), vec3(0.93, 0.85, 0.63), n4), areia);
  c *= 1.0 - 0.32 * smoothstep(0.9, 0.1, h) * areia;
  vec3 aceso = vec3(0.0);
  vec2 dv = p - uVulcao; float rv = length(dv * vec2(1.0, 1.08));
  float vm = smoothstep(41.0, 27.0, rv + (n3 - 0.5) * 9.0) * smoothstep(1.6, 5.0, h);
  if (vm > 0.0) {
    vec3 basalto = mix(vec3(0.13, 0.09, 0.08), vec3(0.36, 0.20, 0.13), n3) * (0.75 + 0.5 * n4);
    c = mix(c, basalto, vm);
    float ang = atan(dv.y, dv.x) / 6.2832;
    float veio = texture(uRuido, vec2(ang * 3.0 + rv * 0.006, 0.31)).g;
    float lava = smoothstep(0.66, 0.74, veio) * smoothstep(28.0, 7.0, rv) * vm;
    float pulso = 0.75 + 0.25 * sin(uTempo * 2.6 - rv * 0.5);
    aceso = vec3(2.6, 0.5, 0.04) * lava * pulso * smoothstep(0.35, 0.75, texture(uRuido, vec2(ang * 7.0, rv / 38.0 - uTempo * 0.05)).b + 0.2);
    c = mix(c, vec3(0.1, 0.03, 0.02), lava);
  }
  vec2 uv = (p - uArea.xy) / uArea.zw; vec3 s = texture(uPintura, uv).rgb;
  if (s.g > 0.3) {
    vec2 sulco = s.g > 0.8 ? vec2(0.97, 0.24) : vec2(0.24, 0.97);
    float f = 0.5 + 0.5 * sin(dot(p, sulco) * 3.1);
    vec3 planta = s.g > 0.8 ? mix(vec3(0.66, 0.49, 0.18), vec3(0.90, 0.74, 0.32), f) : mix(vec3(0.38, 0.25, 0.13), vec3(0.45, 0.62, 0.20), f);
    c = planta * (0.85 + 0.3 * n4);
  }
  float piso = vE.x;
  if (piso > 0.01) {
    vec2 g = abs(fract(p / 4.5) - 0.5); float junta = smoothstep(0.43, 0.49, max(g.x, g.y));
    float pedra = texture(uRuido, floor(p / 1.5) / 37.0).a;
    c = mix(c, mix(vec3(0.64, 0.60, 0.54) * (0.78 + 0.45 * pedra), vec3(0.40, 0.38, 0.35), junta * 0.8) * (0.9 + 0.2 * n4), piso);
  }
  float via = smoothstep(0.16, 0.62, s.r);
  float margem = smoothstep(0.05, 0.15, s.b) * (1.0 - smoothstep(0.44, 0.50, s.b)) * step(0.0, h);
  c = mix(c, mix(vec3(0.46, 0.38, 0.23), vec3(0.76, 0.68, 0.47), smoothstep(0.35, 0.65, miudo)) * (0.8 + 0.35 * n4), margem * 0.92);
  c = mix(c, mix(vec3(0.55, 0.43, 0.26), vec3(0.86, 0.74, 0.50), smoothstep(0.45, 0.95, s.r)) * (0.82 + 0.22 * n4 + 0.18 * miudo), via);
  if (h < 0.0) c = mix(c, vec3(0.07, 0.17, 0.17), smoothstep(0.3, 9.0, -h));
  // relevo fino: pequenas ondulações no chão
  vec2 e = vec2(1.1, 0.0);
  float gx = texture(uRuido, (p + e.xy) / 26.0).b - texture(uRuido, (p - e.xy) / 26.0).b;
  float gz = texture(uRuido, (p + e.yx) / 26.0).b - texture(uRuido, (p - e.yx) / 26.0).b;
  N = normalize(N - vec3(gx, 0.0, gz) * (1.1 + r * 3.2) * (1.0 - via) * (1.0 - piso));
  N = normalize(N + (vec3(lado1, lado2, texture(uRuido, vec2(p.x, p.y + h * 2.0) / 9.0).a) - 0.5) * r * smoothstep(0.12, 0.45, inclina) * 1.1);
  float sh = sombra(vP, normalize(vN)) * nuvem(p);
  vec3 alb = lin(c);
  vec3 luz = uLuz * max(dot(N, uSol), 0.0) * sh + (uCeu * (0.55 + 0.45 * N.y) + vec3(0.05, 0.035, 0.02)) * vE.z;
  vec3 saida = alb * luz + aceso;
  float rio = smoothstep(0.43, 0.50, s.b) * step(0.0, h);
  if (rio > 0.0) {
    float a = texture(uRuido, (p + vec2(uTempo * 2.0, uTempo * 7.0)) / 40.0).b - 0.5, b = texture(uRuido, (p - vec2(uTempo * 4.0, -uTempo * 3.0)) / 23.0).b - 0.5;
    vec3 Na = normalize(vec3(a * 0.6, 1.0, b * 0.6)), V = normalize(uCam - vP), Lg = normalize(vec3(uSol.x * 0.9, 1.35, -0.75));
    float fundo = smoothstep(0.48, 0.92, s.b);
    vec3 agua = mix(vec3(0.075, 0.30, 0.27), vec3(0.006, 0.075, 0.17), fundo) * (uCeu * 1.5 + uLuz * 0.26 * sh);
    agua += uHorizonte * (0.05 + 0.6 * pow(1.0 - max(dot(Na, V), 0.0), 3.0)) * (0.6 + 0.8 * smoothstep(0.38, 0.7, texture(uRuido, (p + a * 6.0) / 33.0).g));
    float copas = smoothstep(0.42, 0.72, texture(uRuido, (p + vec2(a, b) * 7.0) / 13.0).b) * (1.0 - smoothstep(0.52, 0.70, s.b));
    agua = mix(agua, vec3(0.012, 0.05, 0.022), copas * 0.75);
    agua += uLuz * pow(max(dot(reflect(-Lg, Na), V), 0.0), 220.0) * 0.5 * sh;
    float beira = (1.0 - smoothstep(0.47, 0.56, s.b)) * smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(s.b * 150.0 - uTempo * 2.4 + a * 9.0));
    agua += vec3(0.35, 0.42, 0.40) * beira * (0.4 + 0.6 * sh);
    vec2 cela = floor(p / 9.0); float s1 = fract(sin(dot(cela, vec2(41.3, 289.1))) * 43758.5), s2 = fract(sin(dot(cela, vec2(93.7, 17.3))) * 24634.6);
    float idade = fract(uTempo * 0.23 + s1 * 7.0), anel = smoothstep(0.32, 0.0, abs(length(p - (cela + vec2(0.25) + vec2(s1, s2) * 0.5) * 9.0) - idade * 3.4)) * (1.0 - idade) * step(0.5, s2);
    agua += uHorizonte * anel * 0.55;
    saida = mix(saida, agua, rio);
  }
  cor = vec4(revelar(saida), 1.0);
}`;

  const VS_PECA = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCor; layout(location=3) in vec2 aUv; layout(location=4) in float aMat;
layout(location=5) in vec4 iPos; layout(location=6) in vec4 iCor;
uniform mat4 uVP; uniform float uTempo, uVento, uHelice; out vec3 vP, vN, vC; out vec2 vUv; flat out int vMat;
void main() {
  vec3 p = aPos, n = aNor; int mat = int(aMat + 0.5);
  if (mat == 3) p.z += sin(uTempo * 5.5 - aUv.x * 5.0 + iPos.x) * aUv.x * 1.4;
  if (mat == 11) p.y += sin(uTempo * 9.0 + iPos.x * 0.7 + iPos.z) * abs(aPos.z) * 0.45;
  if (uHelice != 0.0) { float hc = cos(uHelice), hs = sin(uHelice); mat2 R = mat2(hc, hs, -hs, hc); p.xy = R * p.xy; n.xy = R * n.xy; }
  float g = iCor.a, c = cos(g), s = sin(g);
  p.xz = mat2(c, s, -s, c) * p.xz; n.xz = mat2(c, s, -s, c) * n.xz;
  p *= iPos.w; p.x += sin(uTempo * 1.3 + iPos.x * 0.13 + iPos.z * 0.07) * 0.035 * p.y * uVento;
  p += iPos.xyz;
  vP = p; vN = n; vC = aCor * iCor.rgb; vUv = aUv; vMat = mat; gl_Position = uVP * vec4(p, 1.0);
}`;
  const FS_PECA = COMUM + `
uniform sampler2D uAltura; uniform vec4 uArea;
in vec3 vP, vN, vC; in vec2 vUv; flat in int vMat; out vec4 cor;` + LUZ + `
float sorteio(vec2 q) { return fract(sin(dot(q, vec2(12.99, 78.23))) * 43758.5); }
void main() {
  if (vMat == 5) { cor = vec4(1.0, 0.94, 0.68, (1.0 - vUv.x) * 0.42 * uNoite * (1.0 - abs(vUv.y / max(vUv.x, 0.001) - 0.5))); return; }
  vec3 N = normalize(vN), alb = lin(vC), V = normalize(uCam - vP);
  if (vMat == 12) N = vec3(0.0, 1.0, 0.0);
  if (vMat == 13) { // folhagem: manchas de folhas e relevo
    vec2 q = vP.xz * 0.9 + vP.y * vec2(0.71, -0.53);
    float f1 = texture(uRuido, q / 6.5).a, f2 = texture(uRuido, q.yx / 3.1 + 0.4).a;
    N = normalize(N + (vec3(f1, f2, texture(uRuido, q / 4.3 + 0.7).b) - 0.5) * 1.5);
    alb *= 0.42 + 1.25 * smoothstep(0.28, 0.74, f1 * 0.55 + f2 * 0.45);
  }
  float solo = max(texture(uAltura, (vP.xz - uArea.xy) / uArea.zw).r, 0.0);
  float contato = mix(0.52, 1.0, smoothstep(-0.4, vMat == 12 ? 1.4 : 3.4, vP.y - solo)); // escurece junto ao chão
  float grao = texture(uRuido, (vP.xz + vP.y * vec2(1.3, 0.7)) / 8.0).a;
  if (vMat == 0 || vMat == 7 || vMat == 8) alb *= 0.80 + 0.40 * grao;
  if (vMat == 7) { // fileiras de telha
    float fi = vP.y * 2.1, col = (vP.x + vP.z) * 1.2 + step(0.5, fract(floor(fi) * 0.5)) * 0.5;
    alb *= (0.62 + 0.5 * smoothstep(0.0, 0.5, fract(fi))) * (0.82 + 0.34 * sorteio(vec2(floor(col), floor(fi)))) * (0.86 + 0.14 * step(0.14, fract(col)));
  }
  if (vMat == 8) { // blocos de pedra
    float fi = vP.y * 1.5, col = (vP.x + vP.z) * 0.8 + step(0.5, fract(floor(fi) * 0.5)) * 0.5;
    alb *= (1.0 - 0.30 * min(step(fract(fi), 0.14) + step(fract(col), 0.09), 1.0)) * (0.86 + 0.28 * sorteio(vec2(floor(col), floor(fi))));
  }
  bool fina = vMat == 3 || vMat == 11;
  float dif = dot(N, uSol); dif = fina ? abs(dif) : max(dif, 0.0);
  float sh = sombra(vP, fina ? vec3(0.0, 1.0, 0.0) : N) * nuvem(vP.xz);
  vec3 s = alb * (uLuz * dif * sh + uCeu * (0.62 + 0.38 * N.y) + vec3(0.035, 0.025, 0.015)) * contato;
  if (vMat == 1 && N.y < 0.5) {
    vec2 f = fract(vUv), q = floor(vUv);
    if (f.x > 0.15 && f.x < 0.85 && f.y > 0.13 && f.y < 0.21) s *= 1.55; // peitoril
    if (f.x > 0.19 && f.x < 0.81 && f.y > 0.21 && f.y < 0.82) {
      float sorte = sorteio(q + floor(vP.xz / 7.0));
      vec3 vidro = mix(lin(vec3(0.10, 0.18, 0.28)), uHorizonte * 0.75, 0.12 + 0.5 * f.y * f.y) * (0.5 + 0.6 * sh);
      vidro += uLuz * pow(max(dot(reflect(-uSol, N), V), 0.0), 18.0) * 0.5 * sh + 0.07 * step(0.6, fract((f.x + f.y) * 1.4)) * uCeu;
      s = mix(vidro, vec3(2.6, 1.7, 0.6), uNoite * step(0.38, sorte));
      if (f.x < 0.25 || f.x > 0.75 || f.y < 0.27 || f.y > 0.76 || abs(f.x - 0.5) < 0.028 || abs(f.y - 0.53) < 0.025) s = lin(vec3(0.93, 0.9, 0.83)) * (uLuz * dif * sh + uCeu) * contato;
    }
  }
  if (vMat == 12) s += alb * uLuz * 0.12 * sh;
  if (vMat == 13) s += alb * uLuz * vec3(1.0, 1.1, 0.5) * 0.14 * sh * pow(max(dot(-V, uSol) * 0.5 + 0.5, 0.0), 2.0);
  if (vMat == 2) s = alb * (2.6 + 0.8 * sin(uTempo * 3.0 + vP.x));
  if (vMat == 4) { float onda = texture(uRuido, (vP.xz + uTempo * 4.0) / 9.0).b; s = mix(s, uHorizonte * 0.8, 0.25 + 0.35 * smoothstep(0.45, 0.75, onda)); }
  if (vMat == 6) s += vec3(3.2, 2.3, 0.8) * uNoite;
  cor = vec4(revelar(s), 1.0);
}`;

  const VS_MAR = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uVP; out vec3 vP; void main() { vP = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FS_MAR = COMUM + `
uniform sampler2D uAltura; uniform vec4 uArea; in vec3 vP; out vec4 cor;` + LUZ + `
void main() {
  vec2 p = vP.xz, uv = (p - uArea.xy) / uArea.zw;
  float h = texture(uAltura, uv).r;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) h = -15.0;
  float fundo = max(-h, 0.0);
  float a = texture(uRuido, (p + vec2(uTempo * 4.0, uTempo * 2.2)) / 92.0).g - 0.5, b = texture(uRuido, (p + vec2(-uTempo * 3.2, uTempo * 4.1)) / 57.0).g - 0.5;
  float c1 = texture(uRuido, (p + vec2(uTempo * 6.0, -uTempo * 3.0)) / 24.0).b - 0.5, d1 = texture(uRuido, (p.yx + vec2(uTempo * 2.0, uTempo * 5.0)) / 31.0).b - 0.5;
  vec3 N = normalize(vec3((a + c1 * 0.7) * 0.34, 1.0, (b + d1 * 0.7) * 0.34)), V = normalize(uCam - vP);
  vec3 corpo = mix(vec3(0.055, 0.36, 0.37), vec3(0.012, 0.115, 0.21), smoothstep(0.4, 7.0, fundo));
  corpo = mix(corpo, vec3(0.006, 0.055, 0.125), smoothstep(7.0, 15.0, fundo) * (0.55 + 0.45 * texture(uRuido, p / 300.0).r));
  float sh = mix(1.0, sombra(vec3(vP.x, 0.3, vP.z), vec3(0.0, 1.0, 0.0)), 0.45) * nuvem(p);
  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 s = corpo * (uCeu * 1.2 + uLuz * 0.22 * sh) + uHorizonte * fres * 0.55;
  vec3 Lg = normalize(vec3(uSol.x * 0.85, 1.35, -0.72));
  float espelho = max(dot(reflect(-Lg, N), V), 0.0);
  vec2 rastro = (p - vec2(uSol.x * 150.0, -205.0)) / vec2(95.0, 175.0); float faixa = exp(-dot(rastro, rastro));
  s += uLuz * (pow(espelho, 260.0) * 1.7 + pow(espelho, 30.0) * 0.07) * (0.02 + faixa * 0.85) * sh;
  float quebra = texture(uRuido, p / 19.0 + uTempo * 0.025).b;
  float onda = smoothstep(0.8, 0.99, sin(fundo * 3.4 + uTempo * 1.9 + quebra * 7.0)) * smoothstep(2.8, 0.6, fundo);
  float espuma = clamp((smoothstep(0.75, 0.05, fundo) * 0.85 + onda * 0.45) * smoothstep(0.36, 0.7, quebra + 0.1), 0.0, 1.0);
  s = mix(s, vec3(0.85, 0.9, 0.9) * (uCeu + uLuz * 0.28 * sh), espuma);
  float alfa = clamp(0.30 + fundo * 0.14 + fres * 0.4 + espuma, 0.0, 0.98);
  cor = vec4(revelar(s), alfa);
}`;

  const VS_FUMACA = `#version 300 es
layout(location=0) in vec4 aOrigem; layout(location=1) in vec2 aDados; uniform mat4 uVP; uniform float uTempo, uEscala; out float vA; out vec3 vTom;
void main() {
  float v = fract(uTempo * 0.11 + aDados.x);
  vec3 p = aOrigem.xyz + vec3(v * v * 24.0 + sin(v * 9.0 + aDados.x * 30.0) * 2.5, v * 30.0, -v * 8.0);
  gl_Position = uVP * vec4(p, 1.0); gl_PointSize = aOrigem.w * (0.55 + v * 2.2) * uEscala / gl_Position.w;
  vA = (1.0 - v) * smoothstep(0.0, 0.14, v) * aDados.y; vTom = mix(vec3(0.55, 0.49, 0.47), vec3(0.95, 0.94, 0.95), v);
}`;
  const FS_FUMACA = `#version 300 es
precision highp float; uniform vec3 uTinta; in float vA; in vec3 vTom; out vec4 cor;
void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.08, length(d)); cor = vec4(vTom * uTinta * (1.0 - d.y * 0.35), a * vA); }`;

  // ── matrizes ──────────────────────────────────────────────────
  function vezes(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) o[c * 4 + l] = a[l] * b[c * 4] + a[4 + l] * b[c * 4 + 1] + a[8 + l] * b[c * 4 + 2] + a[12 + l] * b[c * 4 + 3]; return o; }
  function olhar(olho, alvo) { const z = norm(sub(olho, alvo)), x = norm(cruz([0, 1, 0], z)), y = cruz(z, x), p = v => -(v[0] * olho[0] + v[1] * olho[1] + v[2] * olho[2]); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, p(x), p(y), p(z), 1]); }
  const perspectiva = (fov, a, n, f) => { const t = 1 / Math.tan(fov / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); };
  const reta = (l, r, b, t, n, f) => new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]);

  // ── acabamento da imagem: brilho nas luzes, foco de maquete, cor e vinheta ──
  const VS_TELA = `#version 300 es
out vec2 vUv; void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const FS_BORRAR = `#version 300 es
precision highp float; uniform sampler2D uImg; uniform vec2 uPasso; uniform float uCorte; in vec2 vUv; out vec4 cor;
vec3 ler(vec2 q) { vec3 c = texture(uImg, q).rgb; if (uCorte > 0.0) c *= smoothstep(uCorte, 1.0, max(c.r, max(c.g, c.b))); return c; }
void main() {
  vec3 s = ler(vUv) * 0.227;
  s += (ler(vUv + uPasso * 1.385) + ler(vUv - uPasso * 1.385)) * 0.316;
  s += (ler(vUv + uPasso * 3.231) + ler(vUv - uPasso * 3.231)) * 0.0705;
  cor = vec4(s, 1.0);
}`;
  const FS_FINAL = `#version 300 es
precision highp float; uniform sampler2D uImg, uSuave, uBrilho; uniform float uForca, uMaquete; in vec2 vUv; out vec4 cor;
void main() {
  vec3 nitida = texture(uImg, vUv).rgb, suave = texture(uSuave, vUv).rgb;
  float longe = smoothstep(0.31, 0.53, abs(vUv.y - 0.47));
  vec3 c = mix(nitida, suave, longe * uMaquete);
  c += (nitida - suave) * 0.22 * (1.0 - longe); // realça os detalhes no centro
  c += texture(uBrilho, vUv).rgb * uForca;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.02); c = (c - 0.5) * 1.02 + 0.5;
  c *= 1.0 - 0.22 * smoothstep(0.40, 0.86, distance(vUv, vec2(0.5)));
  cor = vec4(c, 1.0);
}`;
  function criarAcabamento(gl, programa) {
    const borrar = programa(VS_TELA, FS_BORRAR), final = programa(VS_TELA, FS_FINAL);
    const semNada = gl.createVertexArray();
    const amostras = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    let q = null;
    const imagem = (w, h) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return { t, f, w, h };
    };
    function preparar(W, H) {
      if (q && q.W === W && q.H === H) return q;
      if (q) { for (const i of q.todas) { gl.deleteFramebuffer(i.f); gl.deleteTexture(i.t); } gl.deleteFramebuffer(q.cena); q.rbs.forEach(b => gl.deleteRenderbuffer(b)); }
      const cena = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, cena);
      const rbs = [[gl.COLOR_ATTACHMENT0, gl.RGBA8], [gl.DEPTH_ATTACHMENT, gl.DEPTH_COMPONENT24]].map(([onde, formato]) => {
        const b = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, b); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, amostras, formato, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, onde, gl.RENDERBUFFER, b); return b;
      });
      const m = [Math.max(1, W >> 1), Math.max(1, H >> 1)], p = [Math.max(1, W >> 2), Math.max(1, H >> 2)];
      q = { W, H, cena, rbs, todas: [imagem(W, H), imagem(...m), imagem(...m), imagem(...p), imagem(...p)] };
      return q;
    }
    function aplicar(W, H, noite, zoom) {
      const [nitida, a, b, c, d] = q.todas;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, q.cena); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, nitida.f);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.bindVertexArray(semNada);
      gl.useProgram(borrar.p); gl.uniform1i(borrar.u('uImg'), 4); gl.activeTexture(gl.TEXTURE4);
      const passar = (de, para, px, py, corte) => { gl.bindTexture(gl.TEXTURE_2D, de.t); gl.bindFramebuffer(gl.FRAMEBUFFER, para.f); gl.viewport(0, 0, para.w, para.h); gl.uniform2f(borrar.u('uPasso'), px, py); gl.uniform1f(borrar.u('uCorte'), corte); gl.drawArrays(gl.TRIANGLES, 0, 3); };
      passar(nitida, a, 0, 0, 0); passar(a, b, 1 / a.w, 0, 0); passar(b, a, 0, 1 / a.h, 0);
      passar(nitida, c, 0, 0, 0.8); passar(c, d, 1.6 / c.w, 0, 0); passar(d, c, 0, 1.6 / c.h, 0); passar(c, d, 3 / c.w, 0, 0); passar(d, c, 0, 3 / c.h, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(final.p);
      [[nitida, 'uImg', 4], [a, 'uSuave', 5], [c, 'uBrilho', 6]].forEach(([img, nome, u]) => { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, img.t); gl.uniform1i(final.u(nome), u); });
      gl.uniform1f(final.u('uForca'), 0.14 + noite * 0.75); gl.uniform1f(final.u('uMaquete'), Math.max(0.2, Math.min(0.8, 1.1 - zoom * 0.3)));
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
      for (const u of [5, 6, 4]) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); }
    }
    return { preparar, aplicar };
  }

  const CSS = `
    .w3-caixa { position: relative; width: 100%; max-width: 430px; margin: 0 auto; aspect-ratio: ${MW} / ${MH}; border-radius: 18px; overflow: hidden; touch-action: pan-y; user-select: none; -webkit-user-select: none; background: #0b3350; box-shadow: 0 14px 30px rgba(0,0,0,.55), inset 0 0 0 2px #ffffff22; font-family: 'DM Sans', sans-serif; }
    .w3-caixa canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .w3-camada { position: absolute; inset: 0; pointer-events: none; }
    .w3-placa, .w3-rota, .w3-seta, .w3-farol { position: absolute; left: 0; top: 0; }
    .w3-placa { display: flex; align-items: center; gap: 5px; margin: 0; padding: 1px 7px 1px 2px; border-radius: 999px; border: 1px solid #ffffff88; background: rgba(14,19,33,.82); color: #fff; font: 700 10px/1 'DM Sans', sans-serif; white-space: nowrap; pointer-events: auto; cursor: pointer; box-shadow: 0 3px 8px #0007; backdrop-filter: blur(2px); }
    .w3-placa::before { content: ''; position: absolute; inset: -9px -8px; }
    .w3-placa:hover, .w3-placa:focus-visible { background: #2b3556; }
    .w3-placa.wm-aberta { border: 2px solid #ffd34d; }
    .w3-selo { width: 14px; height: 14px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #10131f; font-size: 9px; font-weight: 800; box-shadow: inset 0 0 0 1px #fff9; }
    .w3-cadeado { width: 9px; height: 10px; opacity: .85; }
    .w3-rota { width: 13px; height: 13px; margin: 0; border-radius: 50%; display: grid; place-items: center; background: #fdf3d2e6; color: #5a3d14; border: 1px solid #8a6a35; font-size: 8px; font-weight: 800; }
    .w3-seta { width: 20px; height: 26px; }
    .w3-seta svg { display: block; animation: w3-seta 1s ease-in-out infinite; }
    .w3-farol { width: 62px; height: 26px; border-radius: 50%; border: 2px solid #fff3a8; animation: w3-farol 1.7s ease-out infinite; }
    .w3-titulo { position: absolute; right: 10px; bottom: 10px; padding: 4px 12px 5px; border-radius: 8px; background: #fdf3d2ee; border: 2px solid #8a6a35; color: #5a3d14; text-align: center; pointer-events: none; }
    .w3-titulo b { display: block; font: 800 15px 'Fraunces', serif; letter-spacing: 2px; }
    .w3-titulo small { display: block; font-size: 8px; font-weight: 700; color: #7a5c2c; }
    .w3-bussola { position: absolute; right: 9px; bottom: 62px; width: 34px; height: 34px; pointer-events: none; filter: drop-shadow(0 2px 3px #0008); }
    .w3-luz { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: screen; }
    .w3-sol { position: absolute; width: 38px; height: 38px; margin: -19px 0 0 -19px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, #fffdf0 0 30%, #ffe48a 45%, #ffb52e66 60%, #ffb52e00 72%); filter: drop-shadow(0 0 16px #ffd75a); }
    .w3-zoom { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); display: flex; gap: 6px; }
    .w3-zoom button { width: 30px; height: 30px; padding: 0; border-radius: 50%; border: 1px solid #ffffff77; background: rgba(14,19,33,.78); color: #fff; font: 800 17px/1 'DM Sans', sans-serif; cursor: pointer; }
    .w3-titulo { transition: opacity .3s; }
    .wm-botao3 { display: block; margin: 8px auto 0; padding: 6px 12px; border-radius: 999px; border: 1px solid #ffffff33; background: #181c2e; color: #f2f2f2; font: 700 12px 'DM Sans', sans-serif; cursor: pointer; }
    @keyframes w3-seta { 50% { transform: translateY(-5px); } }
    @keyframes w3-farol { 0% { scale: .6; opacity: 1; } 100% { scale: 1.35; opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .w3-seta svg, .w3-farol { animation: none; } }
  `;
  let cssPronto = false;

  function render3d(alvo, opts) {
    const o = Object.assign({ cities: [], badges: [], open: [0], onCity: () => { }, types: {} }, opts);
    const tela = document.createElement('canvas');
    const gl = tela.getContext('webgl2', { antialias: false, alpha: false, failIfMajorPerformanceCaveat: true });
    if (!gl) throw new Error('sem WebGL2');
    const soltar = () => { const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); };
    try { return montar(alvo, o, tela, gl, soltar); } catch (e) { soltar(); throw e; }
  }

  function montar(alvo, o, tela, gl, soltar) {
    const nomes = o.cities.map(c => c.name);
    if (!mundo) mundo = criarMundo(nomes);
    const M = mundo;

    const programa = (vs, fs) => {
      const p = gl.createProgram();
      for (const [tipo, fonte] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(tipo); gl.shaderSource(s, fonte); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('programa: ' + gl.getProgramInfoLog(p));
      const cache = {};
      return { p, u: n => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))) };
    };
    const pTerra = programa(VS_TERRA, FS_TERRA), pPeca = programa(VS_PECA, FS_PECA), pMar = programa(VS_MAR, FS_MAR), pFumaca = programa(VS_FUMACA, FS_FUMACA);
    const vazio = `#version 300 es\nprecision highp float; void main() {}`;
    const sTerra = programa(VS_TERRA, vazio), sPeca = programa(VS_PECA, vazio);

    const dados = (arr, alvoGl) => { const b = gl.createBuffer(); gl.bindBuffer(alvoGl || gl.ARRAY_BUFFER, b); gl.bufferData(alvoGl || gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; };
    const attr = (loc, n, passo, desl, divisor) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, passo * 4, desl * 4); if (divisor) gl.vertexAttribDivisor(loc, divisor); };
    const vao = montagem => { const v = gl.createVertexArray(); gl.bindVertexArray(v); montagem(); gl.bindVertexArray(null); return v; };
    const terra = vao(() => { dados(M.verts); attr(0, 3, 10, 0); attr(1, 3, 10, 3); attr(2, 4, 10, 6); dados(M.indices, gl.ELEMENT_ARRAY_BUFFER); });
    const peca = (verts, inst) => ({ n: verts.length / 12, vezes: inst ? inst.length / 8 : 0, v: vao(() => {
      dados(verts); attr(0, 3, 12, 0); attr(1, 3, 12, 3); attr(2, 3, 12, 6); attr(3, 2, 12, 9); attr(4, 1, 12, 11);
      if (inst) { dados(inst); attr(5, 4, 8, 0, 1); attr(6, 4, 8, 4, 1); }
    }) });
    const fixo = peca(M.obras.fixo), barco = peca(M.obras.barco), navio = peca(M.obras.navio), facho = peca(M.obras.facho);
    const matas = M.arvores.filter(a => a.n).map(a => peca(a.vertices, a.instancias));
    const miudas = M.obras.miudezas.map(a => ({ ...peca(a.vertices, a.instancias), sombra: a.sombra }));
    const moveis = M.obras.moveis.map(a => ({ ...peca(a.vertices), em: a.em, sombra: a.sombra, alto: a.alto }));
    const mar = vao(() => { dados(new Float32Array([-900, 0, -900, 900, 0, -900, -900, 0, 700, -900, 0, 700, 900, 0, -900, 900, 0, 700])); attr(0, 3, 3, 0); });
    const chaoDe = (mx, my) => Math.max(M.chao(mx, my), 0);
    const baforadas = [];
    const fonte = (x, y, z, tam, n, alfa) => { for (let i = 0; i < n; i++) baforadas.push(x, y, z, tam, i / n + 0.013 * (i % 3), alfa); };
    fonte(wx(VULCAO[0]), chaoDe(VULCAO[0], VULCAO[1]) + 6, wz(VULCAO[1]), 10.5, 20, 0.72);
    const NAVIO = [wx(333), 0, wz(SPOTS.Vermilion[1] + 31)];
    fonte(NAVIO[0] - 9, 18, NAVIO[2], 3.4, 7, 0.55);
    for (const v of M.baforadas) baforadas.push(v);
    const fumaca = vao(() => { dados(new Float32Array(baforadas)); attr(0, 4, 6, 0); attr(1, 2, 6, 4); });

    const textura = (unidade, prep) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unidade); gl.bindTexture(gl.TEXTURE_2D, t); prep(); return t; };
    const par = (k, v) => gl.texParameteri(gl.TEXTURE_2D, k, v);
    const lados = m => { par(gl.TEXTURE_WRAP_S, m); par(gl.TEXTURE_WRAP_T, m); };
    textura(0, () => { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, M.barulho.N, M.barulho.N, 0, gl.RGBA, gl.UNSIGNED_BYTE, M.barulho.d); gl.generateMipmap(gl.TEXTURE_2D); par(gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); lados(gl.REPEAT); });
    textura(1, () => { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, M.splat); gl.generateMipmap(gl.TEXTURE_2D); par(gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); lados(gl.CLAMP_TO_EDGE); });
    textura(2, () => { gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, M.nx, M.ny, 0, gl.RED, gl.FLOAT, M.alt); par(gl.TEXTURE_MIN_FILTER, gl.LINEAR); par(gl.TEXTURE_MAG_FILTER, gl.LINEAR); lados(gl.CLAMP_TO_EDGE); });
    const TS = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const mapaSombra = textura(3, () => { gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, TS, TS, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null); par(gl.TEXTURE_MIN_FILTER, gl.LINEAR); par(gl.TEXTURE_MAG_FILTER, gl.LINEAR); par(gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); par(gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); lados(gl.CLAMP_TO_EDGE); });
    const quadroSombra = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, quadroSombra);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, mapaSombra, 0);
    gl.drawBuffers([gl.NONE]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('sem mapa de sombra');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const acabamento = criarAcabamento(gl, programa);

    // ── interface sobre o desenho ───────────────────────────────
    if (!cssPronto) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); cssPronto = true; }
    const parado = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const caixa = document.createElement('div');
    caixa.className = 'wm-caixa w3-caixa';
    const cadeado = '<svg class="w3-cadeado" viewBox="0 0 9 10" aria-hidden="true"><rect x="0" y="4" width="9" height="6" rx="1.2" fill="#e9ecf7"/><path d="M2 4V2.8a2.5 2.5 0 0 1 5 0V4" fill="none" stroke="#e9ecf7" stroke-width="1.3"/></svg>';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const itens = []; // o que acompanha um ponto do mundo
    let marcas = '', placas = '';
    for (let i = 0; i < M.rota.length - 1; i++) {
      const x = (M.rota[i][0] + M.rota[i + 1][0]) / 2, y = (M.rota[i][1] + M.rota[i + 1][1]) / 2;
      marcas += `<span class="w3-rota" data-p="${itens.length}">${i + 1}</span>`; itens.push({ p: [wx(x), Math.max(chaoDe(x, y), 2.4) + 1, wz(y)], ax: 0.5, ay: 0.5 });
    }
    o.cities.forEach((city, i) => {
      const [x, y] = SPOTS[city.name], finale = !city.gym, aberta = o.open.includes(i), vencida = o.badges.includes(i), g = chaoDe(x, y);
      const c = finale ? '#ffd34d' : (o.types[city.gym] || {}).color || '#bbb';
      if (aberta && !vencida) {
        marcas += `<span class="w3-farol" data-p="${itens.length}"></span>`; itens.push({ p: [wx(x), g + 1, wz(y + 2)], ax: 0.5, ay: 0.5 });
        marcas += `<span class="w3-seta" data-p="${itens.length}"><svg viewBox="0 0 20 26" width="20" height="26"><path d="M10 25L1 13h5V1h8v12h5z" fill="#ffd34d" stroke="#5a3d00" stroke-width="1.5"/></svg></span>`; itens.push({ p: [wx(x), g + 44, wz(y)], ax: 0.5, ay: 1 });
      }
      placas += `<button type="button" class="ws-city w3-placa ${aberta ? 'wm-aberta' : 'ws-locked'}" data-city="${i}" data-p="${itens.length}" style="--c:${c}" aria-label="${esc(city.name)}${aberta ? '' : ', em breve'}"><span class="w3-selo">${vencida ? '★' : finale ? '♛' : i + 1}</span><span class="wm-nome">${esc(city.name)}</span>${aberta ? '' : cadeado}</button>`;
      const dy = { Cinnabar: 36, Kanto: 29, Celadon: 22, Pewter: 23, Fuchsia: 27, Viridian: 25, Saffron: 25 }[city.name] || 23;
      const dx = city.name === 'Vermilion' ? -17 : 0;
      itens.push({ p: [wx(x + dx), Math.max(chaoDe(x + dx, y + dy), 1), wz(y + dy)], perto: [wx(x), g + (city.name === 'Saffron' ? 66 : city.name === 'Cinnabar' ? 8 : 34), wz(city.name === 'Cinnabar' ? y + 36 : y - 8)], ax: 0.5, ay: 0.4, placa: true });
    });
    caixa.innerHTML = `<div class="w3-luz"></div><div class="w3-camada">${marcas}</div><div class="w3-camada">${placas}</div><div class="w3-sol" aria-hidden="true"></div>
      <svg class="w3-bussola" viewBox="-20 -20 40 40" aria-hidden="true"><circle r="18" fill="#fdf3d2e0" stroke="#8a6a35" stroke-width="1.6"/><path d="M0-15L4 0H-4Z" fill="#d0473f"/><path d="M0 15L4 0H-4Z" fill="#6b5330"/><text x="-9" y="-6" text-anchor="middle" font-size="9" font-weight="800" fill="#5a3d14" font-family="DM Sans, sans-serif">N</text></svg>
      <div class="w3-titulo"><b>KANTO</b><small>${o.badges.length} de 8 insígnias</small></div>
      <div class="w3-zoom"><button type="button" data-zoom="1" aria-label="Aproximar o mapa">+</button><button type="button" data-zoom="-1" aria-label="Afastar o mapa">−</button><button type="button" data-zoom="0" aria-label="Ver o mapa inteiro">⤢</button></div>`;
    caixa.prepend(tela);
    alvo.appendChild(caixa);
    const elementos = [...caixa.querySelectorAll('[data-p]')];
    const sol = caixa.querySelector('.w3-sol'), halo = caixa.querySelector('.w3-luz'), titulo = caixa.querySelector('.w3-titulo');
    const cam = { z: 1, x: 0, y: 10 }, metaCam = { z: 1, x: 0, y: 10 };
    let vista0 = null, contador = 0, leve = false, sujo = false;

    const meta = { x: -0.45, y: 0.3 }, agora = { x: -0.45, y: 0.3 };
    let ultimoToque = -1e9, quadro = 0, vivo = true, ultimoDesenho = -1e9, tempo = 3, antes = 0;
    const mirar = (x, y) => { meta.x = clamp(x, -1, 1); meta.y = clamp(y, 0, 1); ultimoToque = performance.now(); };
    let largura = 0, altura = 0, qualidade = Math.min(window.devicePixelRatio || 1, 2), custo = 0, medidas = 0;

    const sombraSuja = { x: 99, y: 99 };
    let sombraVP = null;
    function desenhar() {
      const cw = caixa.clientWidth, ch = caixa.clientHeight;
      if (!cw || !ch) return;
      const W = Math.round(cw * qualidade), H = Math.round(ch * qualidade);
      if (tela.width !== W || tela.height !== H) { tela.width = W; tela.height = H; }
      largura = cw; altura = ch;
      const x = agora.x, baixo = agora.y;
      // sol: alto ao meio do dia, rasante no fim da tarde; gira de oeste para leste
      const el = (58 - baixo * 40) * Math.PI / 180, hx = x * 1.35 - 0.2, hz = 0.5, hn = Math.hypot(hx, hz);
      const S = [hx / hn * Math.cos(el), Math.sin(el), hz / hn * Math.cos(el)];
      const tarde = suave(0.42, 0.92, baixo), noite = suave(0.66, 0.96, baixo);
      const L = [mix(2.25, 2.35, tarde), mix(2.03, 1.2, tarde), mix(1.7, 0.56, tarde)];
      const ceu = [mix(0.27, 0.20, tarde), mix(0.40, 0.20, tarde), mix(0.64, 0.40, tarde)];
      const hor = [mix(0.30, 0.66, tarde), mix(0.52, 0.34, tarde), mix(0.78, 0.32, tarde)];

      // câmera: olhando do sul, inclinando um pouco conforme o toque
      const Z = cam.z, giro = parado ? 0 : x * 0.085 / Z, desce = (58 - Math.min(11, (Z - 1) * 5.5) + (parado ? 0 : (0.45 - baixo) * 6 / Z)) * Math.PI / 180, dist = 866 / Z * Math.max(1, (cw / ch < MW / MH ? (MW / MH) / (cw / ch) : 1));
      const alvoCam = [cam.x, Math.min(6, (Z - 1) * 4), cam.y];
      const olho = [alvoCam[0] + Math.sin(giro) * Math.cos(desce) * dist, Math.sin(desce) * dist, alvoCam[2] + Math.cos(giro) * Math.cos(desce) * dist];
      const VP = vezes(perspectiva(31 * Math.PI / 180, cw / ch, Math.max(20, dist * 0.35), dist + 1900), olhar(olho, alvoCam));
      const frente = norm(sub(alvoCam, olho)), lado = norm(cruz(frente, [0, 1, 0]));
      vista0 = { olho, frente, lado, cima: cruz(lado, frente) };
      const area = [wx(DOM.x0) - 0.75, wz(DOM.y0) - 0.75, DOM.w + 1.5, DOM.h + 1.5];

      const comum = p => {
        gl.useProgram(p.p);
        gl.uniform3fv(p.u('uSol'), S); gl.uniform3fv(p.u('uLuz'), L); gl.uniform3fv(p.u('uCeu'), ceu); gl.uniform3fv(p.u('uHorizonte'), hor); gl.uniform3fv(p.u('uCam'), olho);
        gl.uniform1f(p.u('uTempo'), tempo); gl.uniform1f(p.u('uNoite'), noite); gl.uniform1i(p.u('uRuido'), 0); gl.uniform1i(p.u('uSombra'), 3);
        gl.uniformMatrix4fv(p.u('uSombraVP'), false, sombraVP); gl.uniformMatrix4fv(p.u('uVP'), false, VP);
      };
      const constante = (px, py, pz, escala, giroPeca) => { gl.vertexAttrib4f(5, px, py, pz, escala); gl.vertexAttrib4f(6, 1, 1, 1, giroPeca || 0); };
      const barcos = [[wx(322), wz(388), 0.4], [wx(150), wz(430), 2.9], [wx(32), wz(344), 1.5]];
      function pecas(p, paraSombra) {
        gl.uniform1f(p.u('uHelice'), 0);
        gl.uniform1f(p.u('uVento'), 0);
        gl.bindVertexArray(fixo.v); constante(0, 0, 0, 1, 0); gl.drawArrays(gl.TRIANGLES, 0, fixo.n);
        gl.bindVertexArray(navio.v); constante(NAVIO[0], 0.9 + Math.sin(tempo * 1.1) * 0.5, NAVIO[2], 1, 0.25); gl.drawArrays(gl.TRIANGLES, 0, navio.n);
        gl.bindVertexArray(barco.v);
        barcos.forEach(([bx, bz, g], i) => { constante(bx + Math.sin(tempo * 0.07 + i * 2) * 9, 0.7 + Math.sin(tempo * 1.6 + i * 2) * 0.55, bz, 1, g + Math.sin(tempo * 0.2 + i) * 0.12); gl.drawArrays(gl.TRIANGLES, 0, barco.n); });
        gl.uniform1f(p.u('uVento'), parado ? 0 : 1);
        for (const m of matas) { gl.bindVertexArray(m.v); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, m.vezes); }
        if (!leve) for (const m of miudas) if (!paraSombra || m.sombra) { gl.bindVertexArray(m.v); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, m.vezes); }
        gl.uniform1f(p.u('uVento'), 0);
        for (const m of moveis) {
          if ((paraSombra && !m.sombra) || (m.alto && cam.z > 1.7)) continue;
          gl.bindVertexArray(m.v);
          for (const q of m.em(tempo)) { gl.uniform1f(p.u('uHelice'), q.helice || 0); constante(q.x, q.y, q.z, q.escala || 1, q.giro || 0); gl.drawArrays(gl.TRIANGLES, 0, m.n); }
        }
        gl.uniform1f(p.u('uHelice'), 0);
      }

      // 1) o que o sol enxerga (só refaz quando ele se move)
      const trecho = `${Math.round(cam.x / 6)},${Math.round(cam.y / 6)},${Math.round(Z * 6)}`;
      contador++;
      if (Math.abs(sombraSuja.x - x) > 0.006 || Math.abs(sombraSuja.y - baixo) > 0.006 || sombraSuja.t !== trecho || (!parado && contador % 3 === 0)) {
        sombraSuja.x = x; sombraSuja.y = baixo; sombraSuja.t = trecho;
        const meia = Z > 1.15 ? 250 / Z + 50 : 400, faixaX = [Math.max(-195, cam.x - meia), Math.min(195, cam.x + meia)], faixaZ = [Math.max(-240, cam.y - meia), Math.min(235, cam.y + meia)];
        const vista = olhar([S[0] * 900, S[1] * 900, S[2] * 900], [0, 0, 0]);
        let l = 1e9, r = -1e9, b = 1e9, t = -1e9, n = 1e9, f = -1e9;
        for (const cx of faixaX) for (const cy of [-6, 74]) for (const cz of faixaZ) {
          const vx = vista[0] * cx + vista[4] * cy + vista[8] * cz + vista[12], vy = vista[1] * cx + vista[5] * cy + vista[9] * cz + vista[13], vz = vista[2] * cx + vista[6] * cy + vista[10] * cz + vista[14];
          l = Math.min(l, vx); r = Math.max(r, vx); b = Math.min(b, vy); t = Math.max(t, vy); n = Math.min(n, -vz); f = Math.max(f, -vz);
        }
        sombraVP = vezes(reta(l, r, b, t, n - 20, f + 20), vista);
        gl.bindFramebuffer(gl.FRAMEBUFFER, quadroSombra); gl.viewport(0, 0, TS, TS);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, null); // não ler o que está sendo escrito
        gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.2, 2);
        gl.useProgram(sTerra.p); gl.uniformMatrix4fv(sTerra.u('uVP'), false, sombraVP); gl.bindVertexArray(terra); gl.drawElements(gl.TRIANGLES, M.indices.length, gl.UNSIGNED_INT, 0);
        gl.useProgram(sPeca.p); gl.uniformMatrix4fv(sPeca.u('uVP'), false, sombraVP); gl.uniform1f(sPeca.u('uTempo'), tempo); pecas(sPeca, true);
        gl.disable(gl.POLYGON_OFFSET_FILL); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, mapaSombra);
      }

      // 2) a cena
      const quadros = leve ? null : acabamento.preparar(W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, quadros ? quadros.cena : null);
      gl.viewport(0, 0, W, H); gl.clearColor(0.04, 0.16, 0.26, 1);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      comum(pTerra); gl.uniform1i(pTerra.u('uPintura'), 1); gl.uniform4f(pTerra.u('uArea'), wx(DOM.x0), wz(DOM.y0), DOM.w, DOM.h); gl.uniform2f(pTerra.u('uVulcao'), wx(VULCAO[0]), wz(VULCAO[1]));
      gl.bindVertexArray(terra); gl.drawElements(gl.TRIANGLES, M.indices.length, gl.UNSIGNED_INT, 0);
      comum(pPeca); gl.uniform1i(pPeca.u('uAltura'), 2); gl.uniform4fv(pPeca.u('uArea'), area); pecas(pPeca);
      comum(pMar); gl.uniform1i(pMar.u('uAltura'), 2); gl.uniform4fv(pMar.u('uArea'), area);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(mar); gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(false);
      gl.useProgram(pFumaca.p); gl.uniformMatrix4fv(pFumaca.u('uVP'), false, VP); gl.uniform1f(pFumaca.u('uTempo'), tempo); gl.uniform1f(pFumaca.u('uEscala'), H * 1.8);
      gl.uniform3f(pFumaca.u('uTinta'), mix(1, 0.92, tarde), mix(1, 0.66, tarde), mix(1, 0.62, tarde));
      gl.bindVertexArray(fumaca); gl.drawArrays(gl.POINTS, 0, baforadas.length / 6);
      if (noite > 0.02) {
        comum(pPeca); gl.uniform1f(pPeca.u('uVento'), 0); gl.uniform1f(pPeca.u('uHelice'), 0); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.bindVertexArray(facho.v); constante(M.obras.farol[0], M.obras.farol[1], M.obras.farol[2], 1, tempo * 0.8); gl.drawArrays(gl.TRIANGLES, 0, facho.n);
      }
      gl.depthMask(true); gl.bindVertexArray(null);
      if (quadros) acabamento.aplicar(W, H, noite, Z);

      // 3) placas e sol acompanham
      for (const e of elementos) {
        const it = itens[Number(e.dataset.p)], k = it.perto ? suave(1.2, 2, Z) : 0, [a, b, c] = k ? it.p.map((v, j) => mix(v, it.perto[j], k)) : it.p;
        const qx = VP[0] * a + VP[4] * b + VP[8] * c + VP[12], qy = VP[1] * a + VP[5] * b + VP[9] * c + VP[13], qw = VP[3] * a + VP[7] * b + VP[11] * c + VP[15];
        it.sx = (qx / qw * 0.5 + 0.5) * largura; it.sy = (0.5 - qy / qw * 0.5) * altura;
        if (!it.w) { it.w = e.offsetWidth; it.h = e.offsetHeight; }
        if (it.placa && Z < 1.15) { it.sx = clamp(it.sx, it.w / 2 + 4, largura - it.w / 2 - 4); it.sy = clamp(it.sy, it.h, altura - it.h); }
      }
      // em telas estreitas, uma placa que cairia sobre outra desce um pouco
      const postas = [];
      for (const it of itens.filter(i => i.placa).sort((m, n) => m.sy - n.sy)) {
        for (const q of postas) if (Math.abs(it.sx - q.sx) < (it.w + q.w) / 2 && Math.abs(it.sy - q.sy) < (it.h + q.h) / 2 + 1) it.sy = q.sy + (it.h + q.h) / 2 + 1;
        postas.push(it);
      }
      for (const e of elementos) {
        const it = itens[Number(e.dataset.p)];
        e.style.transform = `translate(${(it.sx - it.w * it.ax).toFixed(1)}px, ${(it.sy - it.h * it.ay).toFixed(1)}px)`;
        const fora = it.sx < it.w / 2 || it.sx > largura - it.w / 2 || it.sy < it.h / 2 || it.sy > altura - it.h / 2;
        const coberto = e.className === 'w3-rota' && postas.some(q => Math.abs(it.sx - q.sx) < q.w / 2 + 5 && Math.abs(it.sy - q.sy) < q.h / 2 + 6);
        e.style.visibility = (Z >= 1.15 && fora) || coberto ? 'hidden' : '';
      }
      const spx = 50 + x * 40, spy = 6 + baixo * 17;
      sol.style.opacity = clamp(1 - (Z - 1) / 0.7, 0, 1).toFixed(2); titulo.style.opacity = Z > 1.3 ? '0' : '1';
      caixa.dataset.zoom = Z.toFixed(2);
      sol.style.left = `${spx}%`; sol.style.top = `${spy}%`;
      halo.style.background = `radial-gradient(circle at ${spx}% ${spy}%, rgba(${255},${Math.round(mix(232, 150, tarde))},${Math.round(mix(180, 80, tarde))},${(0.26 + tarde * 0.12).toFixed(2)}), rgba(0,0,0,0) 62%)`;
      caixa.dataset.sol = `${x.toFixed(2)},${baixo.toFixed(2)}`;
    }

    function passo(t) {
      if (!vivo) return;
      if (!caixa.isConnected) { destroy(); return; }
      quadro = requestAnimationFrame(passo);
      if (t - ultimoDesenho < 30) return; // ~30 por segundo poupa bateria
      const dt = Math.min(0.1, (t - (antes || t)) / 1000); antes = t;
      if (!parado) tempo += dt;
      if (!parado && t - ultimoToque > 3500) { meta.x = Math.sin(t / 5600) * 0.85; meta.y = 0.46 - Math.cos(t / 5600) * Math.cos(t / 12000) * 0.42; }
      const dx = meta.x - agora.x, dy = meta.y - agora.y;
      const dz = metaCam.z - cam.z, dcx = metaCam.x - cam.x, dcy = metaCam.y - cam.y;
      if (parado && Math.abs(dx) < 0.003 && Math.abs(dy) < 0.003 && Math.abs(dz) < 0.002 && Math.abs(dcx) + Math.abs(dcy) < 0.05 && !sujo && ultimoDesenho > 0) return;
      sujo = false;
      // se o aparelho não aguenta, desenha com menos pontos
      if (ultimoDesenho > 0 && medidas < 60) { custo += t - ultimoDesenho; if (++medidas === 60 && custo / 60 > 52) { qualidade = Math.max(1, qualidade * 0.7); if (custo / 60 > 75) leve = true; } }
      ultimoDesenho = t;
      agora.x += dx * 0.13; agora.y += dy * 0.13;
      if (parado || Math.abs(dz) < 0.012) cam.z = metaCam.z; else cam.z += dz * 0.2;
      if (parado || Math.abs(dcx) + Math.abs(dcy) < 0.3) { cam.x = metaCam.x; cam.y = metaCam.y; } else { cam.x += dcx * 0.2; cam.y += dcy * 0.2; }
      desenhar();
    }

    const naCaixa = e => { const r = caixa.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const mirarEm = ([sx, sy]) => mirar(sx / largura * 2 - 1, sy / altura);
    const chaoNaTela = ([sx, sy]) => { // ponto do mapa sob um ponto da tela
      const t = Math.tan(31 * Math.PI / 360), u = (sx / largura * 2 - 1) * t * (largura / altura), v = (1 - sy / altura * 2) * t, { olho, frente, lado, cima } = vista0;
      const d = [0, 1, 2].map(k => frente[k] + lado[k] * u + cima[k] * v), k = (3 - olho[1]) / d[1];
      return [olho[0] + d[0] * k, olho[2] + d[2] * k];
    };
    const ajustar = () => {
      const k = 1 - 1 / metaCam.z;
      metaCam.x = clamp(metaCam.x, -180 * k, 180 * k); metaCam.y = clamp(metaCam.y, 10 - 215 * k, 10 + 215 * k);
      caixa.style.touchAction = metaCam.z > 1.02 ? 'none' : 'pan-y';
      sujo = true;
    };
    const aproximar = (z, ponto) => {
      z = clamp(z, 1, 4.5);
      if (z < 1.06) z = 1;
      if (ponto) { const [px, py] = chaoNaTela(ponto), k = metaCam.z / z; metaCam.x = px + (metaCam.x - px) * k; metaCam.y = py + (metaCam.y - py) * k; }
      metaCam.z = z; ajustar();
    };
    const arrastar = (de, para) => { const a = chaoNaTela(de), b = chaoNaTela(para); metaCam.x += a[0] - b[0]; metaCam.y += a[1] - b[1]; ajustar(); cam.x = metaCam.x; cam.y = metaCam.y; };
    const focar = i => { const [x, y] = SPOTS[o.cities[i].name]; metaCam.z = 3.1; metaCam.x = wx(x); metaCam.y = wz(y + 3); ajustar(); };

    const dedos = new Map();
    let inicio = null, ultimoPonto = null;
    const prender = id => { try { caixa.setPointerCapture(id); } catch (err) { /* sem captura */ } };
    caixa.addEventListener('pointerdown', e => {
      if (e.target.closest('.w3-zoom')) return;
      const p = naCaixa(e), placa = !!e.target.closest('.ws-city');
      dedos.set(e.pointerId, p); inicio = dedos.size === 1 ? { p, t: performance.now(), placa } : null;
      if (dedos.size > 1) dedos.forEach((v, id) => prender(id));
      else if (!placa && metaCam.z <= 1.02) mirarEm(p);
    });
    caixa.addEventListener('pointermove', e => {
      const p = naCaixa(e), antes0 = dedos.get(e.pointerId);
      if (!antes0) { if (e.pointerType === 'mouse') mirarEm(p); return; }
      dedos.set(e.pointerId, p);
      if (dedos.size > 1) {
        const outro = [...dedos].find(([id]) => id !== e.pointerId)[1], d0 = Math.hypot(antes0[0] - outro[0], antes0[1] - outro[1]), d1 = Math.hypot(p[0] - outro[0], p[1] - outro[1]);
        const m0 = [(antes0[0] + outro[0]) / 2, (antes0[1] + outro[1]) / 2], m1 = [(p[0] + outro[0]) / 2, (p[1] + outro[1]) / 2];
        arrastar(m0, m1); if (d0 > 8) { aproximar(metaCam.z * d1 / d0, m1); Object.assign(cam, metaCam); }
      } else if (metaCam.z > 1.02) {
        if (inicio && !inicio.movendo) { if (Math.hypot(p[0] - inicio.p[0], p[1] - inicio.p[1]) < 7) { dedos.set(e.pointerId, antes0); return; } inicio.movendo = true; prender(e.pointerId); } // passou de um toque: vira arrasto
        arrastar(antes0, p);
      } else mirarEm(p);
    });
    const soltou = e => {
      const p = naCaixa(e);
      if (e.type === 'pointerup' && dedos.has(e.pointerId) && inicio && !inicio.placa && performance.now() - inicio.t < 280 && Math.hypot(p[0] - inicio.p[0], p[1] - inicio.p[1]) < 10) {
        if (ultimoPonto && performance.now() - ultimoPonto.t < 380 && Math.hypot(p[0] - ultimoPonto.p[0], p[1] - ultimoPonto.p[1]) < 34) { aproximar(metaCam.z > 1.5 ? 1 : 2.8, p); ultimoPonto = null; }
        else ultimoPonto = { p, t: performance.now() };
      }
      dedos.delete(e.pointerId);
    };
    window.addEventListener('pointerup', soltou); window.addEventListener('pointercancel', soltou);
    caixa.addEventListener('wheel', e => { if (e.deltaY > 0 && metaCam.z <= 1.01) return; e.preventDefault(); aproximar(metaCam.z * Math.exp(-e.deltaY * 0.0017), naCaixa(e)); }, { passive: false });
    caixa.querySelectorAll('[data-zoom]').forEach(b => { if (b.tagName === 'BUTTON') b.addEventListener('click', () => { const k = Number(b.dataset.zoom); aproximar(k ? metaCam.z * (k > 0 ? 1.6 : 1 / 1.6) : 1); }); });
    let base = null, botao = null;
    const aoInclinar = e => { if (e.gamma == null) return; if (base === null) base = e.beta; mirar(e.gamma / 28, 0.4 + (e.beta - base) / 50); };
    if (!parado && window.DeviceOrientationEvent && window.matchMedia('(pointer: coarse)').matches) {
      botao = document.createElement('button');
      botao.type = 'button'; botao.className = 'wm-botao wm-botao3'; botao.textContent = '📱 Mover com o celular';
      botao.addEventListener('click', async () => {
        try {
          if (typeof DeviceOrientationEvent.requestPermission === 'function' && (await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
          base = null; window.addEventListener('deviceorientation', aoInclinar); botao.remove();
        } catch (err) { botao.remove(); }
      });
      alvo.appendChild(botao); // fora do desenho, para não cobrir cidade
    }
    caixa.querySelectorAll('.ws-city').forEach(g => g.addEventListener('click', () => { const i = Number(g.dataset.city); if (!o.open.includes(i)) focar(i); o.onCity(i); }));

    let trocado = null;
    tela.addEventListener('webglcontextlost', e => { // a placa de vídeo desistiu: volta ao mapa 2D
      if (!vivo) return;
      e.preventDefault(); destroy(); caixa.remove(); if (botao) botao.remove(); trocado = reserva.render(alvo, o);
    });
    function destroy() {
      if (trocado) { trocado.destroy(); trocado = null; return; }
      if (!vivo) return;
      vivo = false; cancelAnimationFrame(quadro); window.removeEventListener('deviceorientation', aoInclinar); window.removeEventListener('pointerup', soltou); window.removeEventListener('pointercancel', soltou); soltar();
    }
    desenhar();
    quadro = requestAnimationFrame(passo);
    return { destroy, el: caixa, tresD: true, sun: (x, y) => { mirar(x, y); agora.x = meta.x; agora.y = meta.y; desenhar(); } };
  }

  let aguenta = null; // o aparelho tem placa de vídeo para o 3D?
  function podeTresD() {
    if (aguenta === null) {
      try { const g = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true }); aguenta = !!g; if (g) { const e = g.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } }
      catch (e) { aguenta = false; }
    }
    return aguenta;
  }
  function tentar(el, opts) {
    try { return render3d(el, opts); }
    catch (e) { console.warn('[modo solo] mapa 3D indisponível, usando o 2D:', e.message); el.innerHTML = ''; return reserva.render(el, opts); }
  }
  window.wsMapa = {
    SPOTS,
    render(el, opts) {
      if (!podeTresD()) return reserva.render(el, opts);
      if (mundo) return tentar(el, opts);
      // a primeira montagem demora um pouco: mostra um aviso enquanto isso
      const espera = document.createElement('div');
      espera.className = 'wm-caixa';
      espera.style.cssText = `position:relative;width:100%;max-width:430px;margin:0 auto;aspect-ratio:${MW}/${MH};border-radius:18px;background:linear-gradient(#17608f,#0b3350);display:grid;place-items:center;color:#dff2ff;font:700 14px 'DM Sans',sans-serif`;
      espera.textContent = 'Montando o mapa…';
      el.appendChild(espera);
      let real = null, cancelado = false;
      setTimeout(() => { if (cancelado || !espera.isConnected) return; espera.remove(); real = tentar(el, opts); }, 80);
      return { destroy() { cancelado = true; if (real) real.destroy(); }, sun(x, y) { if (real) real.sun(x, y); } };
    },
  };
})();
