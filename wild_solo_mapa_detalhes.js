// ================================================================
// MyDeck — Modo solo: DETALHES do mapa 3D (alpha, 28/11/2026)
// ================================================================
// Tudo o que dá vida ao mapa: casas completas, ruas, praças, cada cidade com o seu jeito, fazendas, moinhos,
// bichos, lagos com margem, cais e vitória-régia, pontes de pedra, vegetação rasteira, praias e coisas que se mexem.
// Quem desenha é o wild_solo_mapa3d.js; aqui só se montam as peças, usando o "kit" que ele entrega.
// Materiais: 0 comum, 1 parede com janelas, 3 bandeira, 6 luz de noite, 7 telhado de telha, 8 pedra e tijolo,
// 11 asa que bate, 12 planta rasteira.
// ================================================================
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  // área calçada de cada cidade: raio e força
  const PISO = { Pewter: [17, 0.55], Cerulean: [16, 0.5], Vermilion: [18, 0.6], Celadon: [22, 0.7], Saffron: [36, 1], Viridian: [9, 0.35], Kanto: [33, 0.95] };
  // espaço já usado pelos marcos de cada cidade: [dx, dy, raio]
  const MARCOS = {
    Pewter: [[-2, -5, 22], [-27, 2, 7], [-22, 10, 5], [26, 7, 7]], Cerulean: [[2, 1, 10], [-14, -22, 4]], Vermilion: [[6, -1, 8], [28, 12, 14], [42, 12, 12]],
    Celadon: [[-6, -7, 18], [-16, 7, 9], [13, 7, 14]], Fuchsia: [[16, 1, 17], [-17, -2, 16], [27, -22, 8], [-5, 9, 7], [36, 15, 6]],
    Saffron: [[-4, -11, 10], [-22, -3, 9], [13, -3, 9], [27, 4, 8], [-29, -17, 7], [11, -21, 7], [-11, 5, 7], [25, -15, 7]], Cinnabar: [], Viridian: [[24, -14, 7]], Kanto: [[0, -4, 31], [0, -30, 9]],
  };
  const PALETAS = {
    Pewter: [['#cfc6b6', '#6f6a66'], ['#bdb3a4', '#8a5f48'], ['#d8d0c0', '#5d6068'], ['#a79c8e', '#746154']],
    Cerulean: [['#f4f1e8', '#2f6fc0'], ['#e8eef5', '#3f8bdc'], ['#f6efe0', '#245a9a'], ['#dfeaf2', '#58a8e0']],
    Vermilion: [['#f3e8d8', '#d86a28'], ['#efe0c8', '#b8481f'], ['#f7f2e6', '#e8923a'], ['#d9e0e4', '#a8431c']],
    Celadon: [['#f2eedd', '#3f9a50'], ['#e6efdc', '#5cb066'], ['#fbf5e6', '#2f7a48'], ['#efe6d2', '#86b852']],
    Fuchsia: [['#efdcc0', '#b94f94'], ['#f6e6ee', '#8f3f7a'], ['#e8d2a8', '#a8763a']],
    Saffron: [['#e4dccb', '#8f86a8'], ['#d8c4a0', '#b06a50'], ['#cfd8e0', '#5f7890']],
    Cinnabar: [['#f1e4d0', '#d96a28'], ['#e9d6bc', '#a8461a'], ['#f6ecd9', '#c0392b']],
    Viridian: [['#e9dcc2', '#a34a35'], ['#e4dccb', '#6f5aa0'], ['#efe5cd', '#bb7e2c'], ['#d9ccae', '#4f7a3a']],
    Kanto: [['#f0ecf5', '#6a5a9a'], ['#e8e2d4', '#a8862a']],
  };

  const gira = (x, y, z, a) => { const c = Math.cos(a), s = Math.sin(a); return (dx, dy, dz) => [x + dx * c - dz * s, y + dy, z + dx * s + dz * c]; };

  // ── casa completa ─────────────────────────────────────────────
  function casa(kit, x, y, z, o) {
    const m = o.m || kit.m, r = kit.rng, w = o.w, h = o.h, d = o.d, a = o.giro || 0, P = gira(x, y, z, a);
    const bloco = (dx, dy, dz, bw, bh, bd, k, extra) => { const p = P(dx, dy, dz); m.caixa(p[0], p[1], p[2], bw, bh, bd, k, { ...extra, giro: a }); };
    bloco(0, -0.5, 0, w + 0.7, 1.4, d + 0.7, '#8b8378', { mat: 8 });
    bloco(0, 0.9, 0, w, h, d, o.parede, { janelas: [w / Math.max(2, Math.round(w / 3)), h / Math.max(1, Math.round(h / 3.4))] });
    bloco(0, 0.9 + h, 0, w + 0.55, 0.45, d + 0.55, '#f2ece0');
    for (const lx of [-w / 2, w / 2]) bloco(lx, 0.9, d / 2, 0.42, h, 0.42, '#e9e1d0');
    const alto = h * 0.5 + 1.6, base = y + 1.35 + h, pt = P(0, 0, 0);
    m.telhado(pt[0], base, pt[2], w * 1.2, d * 1.32, alto, o.telha, { giro: a, lado: o.parede, mat: 7 });
    bloco(0, 1.35 + h + alto - 0.18, 0, w * 1.22, 0.36, 0.55, '#4a3a34');
    // porta, degrau e puxador na frente
    const px = (r() - 0.5) * (w - 3.4);
    bloco(px, 0.9, d / 2 + 0.14, 2.1, 2.9, 0.22, '#efe7d6'); bloco(px, 0.9, d / 2 + 0.26, 1.55, 2.6, 0.18, ['#6b4430', '#35506e', '#7a2f2a'][Math.floor(r() * 3)]); bloco(px, 0.35, d / 2 + 0.9, 2.4, 0.5, 1.1, '#b8b0a2');
    // chaminé
    const cx = (r() < 0.5 ? -1 : 1) * w * 0.28;
    bloco(cx, 1.35 + h, -d * 0.2, 1.15, alto + 0.9, 1.15, '#9a5f4a', { mat: 8 }); bloco(cx, 1.35 + h + alto + 0.9, -d * 0.2, 1.6, 0.35, 1.6, '#5a4038');
    if (o.fumaca) { const p = P(cx, 1.35 + h + alto + 1.5, -d * 0.2); kit.baforada(p[0], p[1], p[2], 3.2, 5, 0.38); }
    const sorte = r();
    if (sorte < 0.35) { // água-furtada
      bloco(-px * 0.4, 1.35 + h + alto * 0.18, d * 0.4, 2.2, 1.7, 1.6, o.parede, { janelas: [2.2, 1.7] });
      const p = P(-px * 0.4, 1.35 + h + alto * 0.18 + 1.7, d * 0.4); m.telhado(p[0], p[1], p[2], 2.8, 2.2, 1.1, o.telha, { giro: a, lado: o.parede, mat: 7 });
    } else if (sorte < 0.6) { // toldo listrado
      const n = 5, lar = Math.min(w - 0.6, 5);
      for (let i = 0; i < n; i++) { const x0 = px - lar / 2 + i * lar / n, x1 = x0 + lar / n; m.quad(P(x0, 4.3, d / 2 + 0.2), P(x1, 4.3, d / 2 + 0.2), P(x1, 3.5, d / 2 + 2), P(x0, 3.5, d / 2 + 2), i % 2 ? '#f4efe6' : o.telha); }
    } else if (sorte < 0.82) { // puxadinho
      const lx = (r() < 0.5 ? -1 : 1) * (w / 2 + 1.5);
      bloco(lx, 0.4, -0.6, 3, h * 0.66, d * 0.7, o.parede, { janelas: [3, h * 0.66] }); const p = P(lx, 0.4 + h * 0.66, -0.6); m.telhado(p[0], p[1], p[2], 3.6, d * 0.84, 1.3, o.telha, { giro: a, lado: o.parede, mat: 7 });
    }
    if (o.jardim !== false) {
      for (let i = -2; i <= 2; i++) { if (Math.abs(i * 1.8 - px) < 1.6) continue; bloco(i * (w / 4.2), 0, d / 2 + 2.6, 0.28, 1.15, 0.28, '#e8dfcd'); }
      bloco(-w * 0.3, 0.55, d / 2 + 2.6, w * 0.34, 0.18, 0.18, '#e8dfcd'); bloco(w * 0.34, 0.55, d / 2 + 2.6, w * 0.26, 0.18, 0.18, '#e8dfcd');
      for (let i = 0; i < 3; i++) { const p = P((r() - 0.5) * w * 1.1, 0.75, d / 2 + 1 + r() * 0.9); m.bola(p[0], p[1], p[2], 0.75, 0.65, 0.75, '#3f7330', i, 0.35, 0); if (r() < 0.7) m.bola(p[0] + 0.3, p[1] + 0.65, p[2] + 0.3, 0.3, 0.3, 0.3, ['#e8508a', '#f4d84a', '#f2f0ea', '#e8683c'][Math.floor(r() * 4)], i, 0, 0); }
    }
  }

  // ── objetos soltos ────────────────────────────────────────────
  const poste = (m, x, y, z) => { m.tubo(x, y, z, 0.2, 0.16, 5.4, 5, '#2f333d'); m.caixa(x, y + 5.4, z, 0.95, 0.9, 0.95, '#ffe7a0', { mat: 6 }); m.tubo(x, y + 6.3, z, 0.85, 0, 0.55, 6, '#2f333d'); };
  const pessoa = (m, x, y, z, k) => { m.tubo(x, y, z, 0.42, 0.32, 1.35, 5, k); m.bola(x, y + 1.75, z, 0.42, 0.42, 0.42, '#e8b890', 1, 0, 0); };
  function carro(m, x, y, z, a, k) {
    const P = gira(x, y, z, a), c = (dx, dy, dz, w, h, d, cor) => { const p = P(dx, dy, dz); m.caixa(p[0], p[1], p[2], w, h, d, cor, { giro: a }); };
    c(0, 0.55, 0, 4.2, 1.1, 2.1, k); c(-0.3, 1.65, 0, 2.2, 0.95, 1.9, '#bcd8ea'); c(-0.3, 2.6, 0, 2.3, 0.22, 2, k);
    for (const dx of [-1.35, 1.35]) for (const dz of [-1.05, 1.05]) c(dx, 0, dz, 0.9, 0.9, 0.35, '#1c1e24');
  }
  function banca(m, x, y, z, k) {
    for (const dx of [-2, 2]) for (const dz of [-1.3, 1.3]) m.caixa(x + dx, y, z + dz, 0.28, 3.1, 0.28, '#8a6238');
    for (let i = 0; i < 5; i++) { const a = x - 2.4 + i * 0.96; m.quad([a, y + 4, z], [a + 0.96, y + 4, z], [a + 0.96, y + 2.9, z + 2], [a, y + 2.9, z + 2], i % 2 ? '#f6f1e8' : k); m.quad([a, y + 4, z], [a + 0.96, y + 4, z], [a + 0.96, y + 2.9, z - 2], [a, y + 2.9, z - 2], i % 2 ? '#f6f1e8' : k); }
    m.caixa(x, y, z + 0.6, 3.8, 1.3, 1.4, '#a87848');
    for (let i = 0; i < 7; i++) m.bola(x - 1.5 + i * 0.5, y + 1.55, z + 0.6, 0.3, 0.3, 0.3, ['#e0463f', '#f2a52c', '#7ac142', '#f4d84a'][i % 4], i, 0, 0);
  }
  function cerca(m, kit, pontos, k) {
    for (let i = 1; i < pontos.length; i++) {
      const [ax, ay] = pontos[i - 1], [bx, by] = pontos[i], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / 3.2)), a = Math.atan2(by - ay, bx - ax);
      for (let j = 0; j < n; j++) {
        const x = ax + (bx - ax) * j / n, y = ay + (by - ay) * j / n, h = kit.chao(x, y); if (h < 0.5) continue;
        m.caixa(kit.wx(x), h - 0.2, kit.wz(y), 0.36, 1.9, 0.36, k);
        const mx = x + (bx - ax) / n / 2, my = y + (by - ay) / n / 2, hm = kit.chao(mx, my);
        for (const alt of [0.75, 1.3]) m.caixa(kit.wx(mx), hm + alt, kit.wz(my), L / n, 0.18, 0.16, k, { giro: a });
      }
    }
  }
  function bicho(m, x, y, z, a, tipo) {
    const P = gira(x, y, z, a), c = (dx, dy, dz, w, h, d, cor) => { const p = P(dx, dy, dz); m.caixa(p[0], p[1], p[2], w, h, d, cor, { giro: a }); };
    const b = (dx, dy, dz, rx, ry, rz, cor, s) => { const p = P(dx, dy, dz); m.bola(p[0], p[1], p[2], rx, ry, rz, cor, s, 0.14, 0); };
    if (tipo === 'ovelha') { b(0, 1.35, 0, 1.35, 0.95, 1, '#f1ede2', 3); b(1.35, 1.75, 0, 0.55, 0.5, 0.45, '#3a332e', 4); for (const dx of [-0.6, 0.6]) for (const dz of [-0.45, 0.45]) c(dx, 0, dz, 0.25, 0.7, 0.25, '#3a332e'); return; }
    const corpo = tipo === 'vaca' ? '#cfc6b6' : tipo === 'zebra' ? '#f0eee8' : tipo === 'elefante' ? '#8d8a90' : tipo === 'girafa' ? '#e0ac52' : '#8a6a48', s = tipo === 'elefante' ? 1.6 : tipo === 'vaca' ? 0.85 : 1.1;
    if (tipo === 'girafa') { for (const dx of [-1, 1]) for (const dz of [-0.55, 0.55]) c(dx, 0, dz, 0.4, 3, 0.4, corpo); c(0, 2.8, 0, 2.9, 1.5, 1.5, corpo); for (let i = 0; i < 6; i++) c(1.3 + i * 0.24, 3.9 + i * 0.85, 0, 0.62, 1, 0.62, i % 2 ? '#b9812f' : corpo); b(3.1, 9.3, 0, 0.85, 0.5, 0.5, corpo, 9); for (const dz of [-0.2, 0.2]) c(2.8, 9.6, dz, 0.14, 0.7, 0.14, '#5a3a1c'); for (const [dx, dy] of [[-0.7, 3.2], [0.5, 3.6], [0, 3]]) c(dx, dy, 0, 0.6, 0.55, 1.56, '#9a6a26'); return; }
    for (const dx of [-1.1, 1.1]) for (const dz of [-0.55, 0.55]) c(dx * s, 0, dz * s, 0.45 * s, 1.35 * s, 0.45 * s, corpo);
    c(0, 1.2 * s, 0, 3.2 * s, 1.5 * s, 1.7 * s, corpo);
    b(2.1 * s, 2.7 * s, 0, 0.8 * s, 0.75 * s, 0.7 * s, corpo, 5);
    if (tipo === 'vaca') { c(-0.7, 1.75, 0, 1, 0.95, 1.52, '#33291f'); c(0.65, 1.1, 0, 0.7, 0.7, 1.5, '#4a3526'); c(1.78, 2.65, 0, 0.9, 0.5, 1.05, '#33291f'); c(2.35, 1.9, 0, 0.45, 0.4, 0.62, '#d99a94'); }
    if (tipo === 'zebra') for (let i = 0; i < 5; i++) c(-1.4 + i * 0.7, 1.19 * s, 0, 0.26, 1.75, 2, '#24211f');
    if (tipo === 'elefante') { c(3.2 * s, 1 * s, 0, 0.45 * s, 1.9 * s, 0.45 * s, corpo); for (const dz of [-1, 1]) b(1.8 * s, 2.7 * s, dz * 0.9 * s, 0.25 * s, 0.85 * s, 0.65 * s, '#7d7a82', 7); }
  }
  function barquinho(m, x, y, z, a, k) {
    const P = gira(x, y, z, a);
    m.quad(P(-2.8, 0.9, -1.2), P(1.8, 0.9, -1.2), P(1.4, 0.1, -0.6), P(-2.4, 0.1, -0.6), k); m.quad(P(-2.8, 0.9, 1.2), P(1.8, 0.9, 1.2), P(1.4, 0.1, 0.6), P(-2.4, 0.1, 0.6), k);
    m.tri(P(1.8, 0.9, -1.2), P(3.6, 1, 0), P(1.8, 0.9, 1.2), k); m.quad(P(-2.4, 0.25, -0.6), P(1.4, 0.25, -0.6), P(1.4, 0.25, 0.6), P(-2.4, 0.25, 0.6), '#c79a62'); m.quad(P(-2.8, 0.9, -1.2), P(-2.8, 0.9, 1.2), P(-2.4, 0.1, 0.6), P(-2.4, 0.1, -0.6), k);
    for (const dx of [-1.4, 0.4]) { const p = P(dx, 0.6, 0); m.caixa(p[0], p[1], p[2], 0.45, 0.2, 2.1, '#8a6238', { giro: a }); }
  }

  // ── desenho no chão: ruas das cidades e trilhas das fazendas ──
  function pintar(g, kit) {
    const traco = (l, v, larg) => { g.strokeStyle = `rgb(${v},0,0)`; g.lineWidth = larg; g.beginPath(); l.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](p[0], p[1])); g.stroke(); };
    for (const [nome, [cx, cy]] of Object.entries(kit.SPOTS)) {
      if (nome === 'Cinnabar' || nome === 'Fuchsia') continue;
      if (nome === 'Saffron') { for (const dx of [-24, -12, 3, 19]) traco([[cx + dx, cy - 26], [cx + dx, cy + 14]], 130, 2.4); for (const dy of [-15, -3, 11]) traco([[cx - 34, cy + dy], [cx + 32, cy + dy]], 130, 2.4); continue; }
      const anel = (rx, ry, v, larg) => traco(Array.from({ length: 29 }, (_, i) => [cx + Math.cos(i / 28 * TAU) * rx, cy - 1 + Math.sin(i / 28 * TAU) * ry]), v, larg);
      if (nome === 'Kanto') { anel(31, 23, 150, 3); traco([[cx, cy + 17], [cx, cy + 34]], 150, 5); continue; }
      anel(24, 15, 105, 2.6); for (const a of [0.5, 2.4, 4.1, 5.6]) traco([[cx + Math.cos(a) * 8, cy - 1 + Math.sin(a) * 5], [cx + Math.cos(a) * 34, cy - 1 + Math.sin(a) * 23]], 82, 1.9);
    }
  }

  // ── montagem de tudo ──────────────────────────────────────────
  function montar(kit) {
    const { m, rng: r, wx, wz, chao, litoral, linhaDist, rota, rio, SPOTS, LAGOS, CAMPOS, VULCAO } = kit;
    const ocupado = kit.ocupado;
    for (const [nome, lista] of Object.entries(MARCOS)) for (const [dx, dy, raio] of lista) ocupado.push([SPOTS[nome][0] + dx, SPOTS[nome][1] + dy, raio]);
    const noLago = (x, y, folga) => LAGOS.some(([cx, cy, rx, ry]) => Math.hypot((x - cx) / (rx + folga), (y - cy) / (ry + folga)) < 1);
    const noCampo = (x, y, f) => CAMPOS.some(([cx, cy, w, h]) => Math.abs(x - cx) < w / 2 + f && Math.abs(y - cy) < h / 2 + f);
    const plano = (x, y) => Math.hypot(chao(x + 3, y) - chao(x - 3, y), chao(x, y + 3) - chao(x, y - 3)) / 6;
    const livre = (x, y, raio, op) => {
      const o = op || {}, h = chao(x, y);
      if (h < 1.7 || h > (o.alto || 16) || plano(x, y) > (o.incl || 0.35) || litoral(x, y) < raio + 2) return false;
      if (linhaDist(x, y, rota) < raio + 2.4 || linhaDist(x, y, rio) < raio + 3.5 || noLago(x, y, raio + 2) || noCampo(x, y, raio) || Math.hypot(x - VULCAO[0], y - VULCAO[1]) < 22) return false;
      return !ocupado.some(([a, b, c]) => Math.hypot(x - a, y - b) < raio + c);
    };
    const ficha = (x, y, raio) => ocupado.push([x, y, raio]);
    const pos = (x, y) => [wx(x), Math.max(chao(x, y), 0) - 0.1, wz(y)];

    // 1) cada cidade ganha os seus enfeites e depois as casas
    const C = n => SPOTS[n];
    { // Pewter: pedreira, gruta, guindaste e fóssil
      const [cx, cy] = C('Pewter');
      for (let i = 0; i < 34; i++) { const x = cx - 30 + r() * 14, y = cy - 18 + r() * 14; if (litoral(x, y) < 3) continue; const [a, b, c] = pos(x, y), s = 1.2 + r() * 2.2; m.caixa(a, b, c, s, s * (0.5 + r() * 0.7), s * 0.9, ['#a59d90', '#8d857a', '#bab2a4'][i % 3], { giro: r() * 3, mat: 8 }); }
      const [a, b, c] = pos(cx - 24, cy - 8); m.tubo(a, b, c, 0.55, 0.45, 15, 6, '#7a5a34'); m.caixa(a + 4.5, b + 14.2, c, 11, 0.7, 0.7, '#8a6a40'); m.caixa(a + 9.4, b + 9.4, c, 0.16, 4.8, 0.16, '#33302c'); m.caixa(a + 9.4, b + 8, c, 2, 1.5, 2, '#9a9286', { mat: 8 });
      const [fx, fy, fz] = pos(cx + 4, cy + 7); m.caixa(fx, fy, fz, 12, 0.7, 6, '#cfc7b8', { mat: 8 });
      for (let i = 0; i < 6; i++) { const x = fx - 4 + i * 1.6, alt = 2.2 + Math.sin(i / 5 * Math.PI) * 1.6; for (const lado of [-1, 1]) { m.caixa(x, fy + 0.7, fz + lado * 1.7, 0.3, alt, 0.3, '#f1ead8'); m.caixa(x, fy + 0.7 + alt, fz + lado * 0.85, 0.3, 0.3, 1.7, '#f1ead8'); } }
      m.bola(fx + 6, fy + 2.4, fz, 1.5, 1.1, 1.1, '#f1ead8', 8, 0.25, 0); ficha(cx + 4, cy + 7, 7);
      for (let i = 0; i < 14; i++) m.caixa(wx(cx - 34 + i * 1.9), chao(cx - 34 + i * 1.9, cy + 2) + 0.1, wz(cy + 2), 0.5, 0.25, 3, '#6a4a2c');
    }
    { // Cerulean: ginásio de cúpula d'água, caixa-d'água e piscinas
      const [cx, cy] = C('Cerulean'), [a, b, c] = pos(cx + 28, cy + 4);
      if (livre(cx + 28, cy + 4, 7, { incl: 0.6 })) { m.tubo(a, b, c, 8, 8, 3.4, 20, '#eef2f6', { tampa: '#cfd8e0' }); m.bola(a, b + 3.4, c, 7.2, 5.8, 7.2, '#3f9fd8', 2, 0); m.tubo(a, b + 8.6, c, 0.5, 0.2, 3.4, 6, '#e9eef5'); ficha(cx + 28, cy + 4, 9); }
      const [d, e, f] = pos(cx - 30, cy - 4); if (litoral(cx - 30, cy - 4) > 5) { for (const dx of [-2, 2]) for (const dz of [-2, 2]) m.caixa(d + dx, e, f + dz, 0.5, 11, 0.5, '#8f99a6'); m.tubo(d, e + 11, f, 3.6, 3.6, 4.6, 14, '#4f93c8', { tampa: '#6fb0dc' }); m.tubo(d, e + 15.6, f, 4, 0, 2.6, 14, '#2f6fa8'); ficha(cx - 30, cy - 4, 5); }
      for (const [dx, dy] of [[-8, 9], [14, 8]]) { const [g, h, i] = pos(cx + dx, cy + dy); m.caixa(g, h, i, 8, 0.7, 5, '#e8e6e0'); m.caixa(g, h + 0.72, i, 6.8, 0.08, 3.8, '#38b4e0', { mat: 4 }); ficha(cx + dx, cy + dy, 4.5); }
    }
    { // Vermilion: armazéns, contêineres, guindaste, quebra-mar e barcos
      const [cx, cy] = C('Vermilion');
      for (let i = 0; i < 22; i++) { const x = cx + 16 + (i % 4) * 5.6 - 2, y = cy - 3 + Math.floor(i / 8) * 3.4; if (litoral(x, y) < 3 || linhaDist(x, y, rio) < 5 || linhaDist(x, y, rota) < 4) continue; const [a, b, c] = pos(x, y); for (let k = 0; k <= (i % 3 === 0 ? 1 : 0); k++) m.caixa(a, b + k * 2.1, c, 4.8, 2, 2.4, ['#c9413a', '#2f6fb8', '#e8a02c', '#3f8f55', '#8a8f98'][(i + k * 2) % 5], { mat: 8 }); }
      const [a, b, c] = pos(cx + 22, cy + 7);
      for (const dx of [-2.6, 2.6]) m.caixa(a + dx, b, c, 0.8, 16, 0.8, '#e8b02c'); m.caixa(a, b + 16, c, 7, 1, 1.4, '#e8b02c'); m.caixa(a + 7, b + 17, c, 17, 0.7, 0.7, '#e8b02c'); m.caixa(a + 14, b + 11, c, 0.18, 6, 0.18, '#2a2c33'); m.caixa(a + 14, b + 9.4, c, 3.4, 1.7, 1.9, '#2f6fb8', { mat: 8 }); ficha(cx + 22, cy + 7, 8);
      for (const [x, y, ang, k] of [[cx + 38, cy + 4, 0.2, '#d8453c'], [cx + 44, cy + 21, -0.3, '#3a74c4'], [cx + 30, cy + 22, 0.1, '#f0e6d0']]) if (litoral(x, y) < -1) barquinho(m, wx(x), 0.2, wz(y), ang, k);
      for (let i = 0; i < 26; i++) { const x = cx + 36 + r() * 16, y = cy - 14 + r() * 7; if (litoral(x, y) < 1 && litoral(x, y) > -9) m.bola(wx(x), 0.4, wz(y), 1.3 + r(), 1, 1.3 + r(), '#8f877b', i, 0.6, 0); }
    }
    { // Celadon: jardins com cerca-viva, coreto e canteiros em volta
      const [cx, cy] = C('Celadon');
      for (const [ox, oy] of [[-30, -4], [27, -10]]) {
        if (!livre(cx + ox, cy + oy, 8, { incl: 0.5 })) continue;
        for (let anel = 0; anel < 3; anel++) { const lx = 8 - anel * 2.4, ly = 6 - anel * 1.8; for (let i = -lx; i <= lx; i += 1.5) for (const j of [-ly, ly]) { if (anel === 0 && Math.abs(i) < 1.6 && j > 0) continue; const [a, b, c] = pos(cx + ox + i, cy + oy + j); m.bola(a, b + 0.7, c, 0.95, 0.85, 0.95, '#2f6b2c', anel * 31 + Math.round(i * 3), 0.2, 0); } for (let j = -ly + 1.5; j < ly; j += 1.5) for (const i of [-lx, lx]) { const [a, b, c] = pos(cx + ox + i, cy + oy + j); m.bola(a, b + 0.7, c, 0.95, 0.85, 0.95, '#2f6b2c', anel * 17 + Math.round(j * 5), 0.2, 0); } }
        for (let i = 0; i < 26; i++) { const [a, b, c] = pos(cx + ox + (r() - 0.5) * 13, cy + oy + (r() - 0.5) * 9); m.bola(a, b + 0.55, c, 0.5, 0.4, 0.5, ['#e8508a', '#f4d84a', '#f5f2ee', '#8f5fd0'][i % 4], i, 0.2, 0); }
        ficha(cx + ox, cy + oy, 10);
      }
      const [a, b, c] = pos(cx - 2, cy + 8); for (let i = 0; i < 6; i++) { const t = i / 6 * TAU; m.tubo(a + Math.cos(t) * 3.2, b, c + Math.sin(t) * 3.2, 0.3, 0.26, 4.2, 6, '#f4efe2'); } m.tubo(a, b, c, 4, 4, 0.5, 16, '#d8d1c0', { tampa: '#e6e0d0' }); m.tubo(a, b + 4.2, c, 4.4, 0, 2.8, 12, '#2f7d4a'); ficha(cx - 2, cy + 8, 5);
    }
    { // Fuchsia: cercados, torre de vigia, cabanas de palha, laguinho e bichos
      const [cx, cy] = C('Fuchsia');
      cerca(m, kit, [[cx - 30, cy - 12], [cx - 30, cy - 28], [cx - 6, cy - 32], [cx + 6, cy - 26], [cx + 6, cy - 14]], '#8a6238');
      for (const [dx, dy, t, ang] of [[-24, -20, 'zebra', 0.4], [-17, -24, 'zebra', 2.8], [-8, -25, 'elefante', 3.4], [-22, -27, 'antilope', 1.2], [-1, -19, 'antilope', 4.4], [32, -6, 'elefante', 0.7], [24, 18, 'zebra', 5.1], [34, 4, 'antilope', 2], [-30, 10, 'zebra', 1.4], [26, -15, 'girafa', 3.6], [31, -21, 'girafa', 2.2], [-28, -15, 'girafa', 0.5]]) if (chao(cx + dx, cy + dy) > 1.4) { const [a, b, c] = pos(cx + dx, cy + dy); bicho(m, a, b, c, ang, t); ficha(cx + dx, cy + dy, 3); }
      for (const [dx, dy] of [[-32, -2], [30, -16]]) if (chao(cx + dx, cy + dy) > 1.6) { const [a, b, c] = pos(cx + dx, cy + dy); for (const px of [-2, 2]) for (const pz of [-2, 2]) m.caixa(a + px, b, c + pz, 0.45, 9, 0.45, '#7a5230'); m.caixa(a, b + 8, c, 6, 0.5, 6, '#8a6238'); m.caixa(a, b + 8.5, c, 4.6, 2.2, 4.6, '#a87c4a', { mat: 8 }); m.tubo(a, b + 10.7, c, 4.8, 0, 3.2, 8, '#c9a052', { mat: 7 }); ficha(cx + dx, cy + dy, 4); }
      for (const [dx, dy] of [[-27, 3], [-20, 14], [4, 13], [18, 15]]) if (livre(cx + dx, cy + dy, 3.4, { incl: 0.6 })) { const [a, b, c] = pos(cx + dx, cy + dy); m.tubo(a, b, c, 3, 3, 3.2, 12, '#e2c394', { mat: 8 }); m.tubo(a, b + 3.2, c, 4.2, 0, 3.4, 12, '#b98a3e', { mat: 7 }); m.caixa(a, b, c + 2.95, 1.4, 2.3, 0.3, '#5a3a22'); ficha(cx + dx, cy + dy, 4); }
      for (const [dx, dy, ang] of [[27, 9, 0.5], [-6, 17, 2.6]]) if (chao(cx + dx, cy + dy) > 1.6) { const [a, b, c] = pos(cx + dx, cy + dy); carro(m, a, b, c, ang, '#6f7d3a'); }
    }
    { // Saffron: prédios menores, terraços, trânsito e trem suspenso
      const [cx, cy] = C('Saffron');
      for (let i = 0, n = 0; i < 400 && n < 26; i++) {
        const x = cx - 34 + r() * 66, y = cy - 27 + r() * 40, w = 5 + r() * 3, d = 5 + r() * 2.4;
        if (!livre(x, y, w * 0.55, { incl: 0.5 })) continue;
        const [a, b, c] = pos(x, y), h = 8 + r() * 15, k = ['#d9c9ae', '#b9c6d2', '#cfa894', '#c4bcd0', '#a8c4bc', '#e2dccb'][n % 6];
        m.caixa(a, b, c, w, h, d, k, { janelas: [w / 3, 2.5], topo: '#7d8189' }); m.caixa(a, b + h, c, w + 0.5, 0.5, d + 0.5, '#e8e6e0', { topo: '#8b8f98' });
        if (n % 3 === 0) { m.tubo(a - w * 0.18, b + h + 0.5, c, 1.1, 1.1, 1.9, 8, '#9a6a48', { tampa: '#8a5a38' }); m.tubo(a - w * 0.18, b + h + 2.4, c, 1.3, 0, 0.9, 8, '#5a4030'); }
        else if (n % 3 === 1) { m.caixa(a + w * 0.15, b + h + 0.5, c - d * 0.1, w * 0.36, 1, d * 0.34, '#aab0ba'); m.caixa(a - w * 0.22, b + h + 0.5, c + d * 0.2, 1.2, 0.7, 1.2, '#c8ccd4'); }
        else m.caixa(a, b + h + 0.5, c, w * 0.6, 0.25, d * 0.6, '#5f9a52');
        ficha(x, y, w * 0.62); n++;
      }
      for (let i = 0; i < 16; i++) { const rua = r() < 0.5, x = rua ? cx + [-24, -12, 3, 19][i % 4] : cx - 30 + r() * 58, y = rua ? cy - 22 + r() * 32 : cy + [-15, -3, 11][i % 3]; if (chao(x, y) < 1.8) continue; const [a, b, c] = pos(x, y); carro(m, a, b, c, rua ? 1.5708 : 0, ['#d8453c', '#f2c22c', '#3a74c4', '#f4f2ec', '#2f3440'][i % 5]); }
      const volta = Array.from({ length: 41 }, (_, i) => [cx - 1 + Math.cos(i / 40 * TAU) * 39, cy - 6 + Math.sin(i / 40 * TAU) * 25]);
      for (let i = 1; i < volta.length; i++) { const [ax, ay] = volta[i - 1], [bx, by] = volta[i], L = Math.hypot(bx - ax, by - ay), g = Math.atan2(by - ay, bx - ax), mx = (ax + bx) / 2, my = (ay + by) / 2; if (litoral(mx, my) < -2) continue; const alt = 10.5; m.caixa(wx(mx), alt, wz(my), L + 0.5, 0.7, 1.7, '#c8ccd6', { giro: g }); if (i % 3 === 0) m.tubo(wx(ax), Math.max(chao(ax, ay), 0), wz(ay), 0.65, 0.5, alt - Math.max(chao(ax, ay), 0), 6, '#a8adb8'); if (i >= 6 && i <= 9) m.caixa(wx(mx), alt + 0.7, wz(my), L * 0.92, 2.1, 2.1, i % 2 ? '#e8473c' : '#f4f2ec', { giro: g, janelas: [1.5, 2.1] }); }
    }
    { // Cinnabar: laboratório com cúpula, fonte termal e praia
      const [cx, cy] = C('Cinnabar'), [a, b, c] = pos(cx - 28, cy + 2);
      if (litoral(cx - 28, cy + 2) > 5) { m.caixa(a, b, c, 10, 5.6, 7, '#f2f0ea', { janelas: [2.4, 2.8], mat: 8 }); m.bola(a - 2, b + 5.6, c, 3.4, 2.8, 3.4, '#cfe0ea', 4, 0, 1); m.tubo(a + 3.4, b + 5.6, c, 0.25, 0.14, 6, 5, '#c8ccd6'); m.bola(a + 3.4, b + 12, c, 0.6, 0.6, 0.6, '#ff5a40', 2, 0, 0); ficha(cx - 28, cy + 2, 7); }
      const [d, e, f] = pos(cx - 11, cy + 14); m.tubo(d, e - 0.2, f, 4.2, 3.8, 0.8, 14, '#8a7a70', { tampa: '#7fd8d8', matTampa: 4 }); for (let i = 0; i < 11; i++) { const t = i / 11 * TAU; m.bola(d + Math.cos(t) * 4.3, e + 0.5, f + Math.sin(t) * 4.3, 1, 0.8, 1, '#6a5a52', i, 0.5, 0); } kit.baforada(d, e + 1.2, f, 4.5, 8, 0.4); ficha(cx - 11, cy + 14, 6);
    }
    { // Viridian: capela, poço, hortas e moinho d'água
      const [cx, cy] = C('Viridian'), [a, b, c] = pos(cx - 28, cy - 4);
      if (livre(cx - 28, cy - 4, 6, { incl: 0.6 })) { m.caixa(a, b, c, 7, 7, 9, '#e4dcc8', { janelas: [2.3, 3.5] }); m.telhado(a, b + 7, c, 8.4, 11, 4.4, '#4f6a8a', { lado: '#e4dcc8', mat: 7 }); m.caixa(a, b, c + 6, 4.4, 13, 4.4, '#d8cfb8', { mat: 8 }); m.tubo(a, b + 13, c + 6, 3.6, 0, 7, 4, '#4f6a8a', { mat: 7 }); m.caixa(a, b + 19.6, c + 6, 0.35, 2.4, 0.35, '#e8c24a'); m.caixa(a, b + 20.8, c + 6, 1.5, 0.35, 0.35, '#e8c24a'); ficha(cx - 28, cy - 4, 8); }
      const [d, e, f] = pos(cx - 3, cy - 8); m.tubo(d, e, f, 1.9, 1.9, 1.6, 10, '#a8a094', { tampa: '#2f5a70', matTampa: 4 }); for (const dx of [-1.7, 1.7]) m.caixa(d + dx, e, f, 0.35, 4.2, 0.35, '#7a5230'); m.telhado(d, e + 4.2, f, 5, 3.2, 1.5, '#8f4130', { mat: 7 }); ficha(cx - 3, cy - 8, 3.4);
      for (const [dx, dy] of [[-16, 11], [20, 16]]) if (chao(cx + dx, cy + dy) > 1.8) { for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const [g, h, k] = pos(cx + dx - 4 + i * 2, cy + dy - 3 + j * 2); m.caixa(g, h, k, 1.6, 0.35, 1.1, '#6a4a2c'); m.bola(g, h + 0.75, k, 0.55, 0.5, 0.55, j % 2 ? '#5aa83c' : '#e0782c', i * 7 + j, 0.2, 0); } cerca(m, kit, [[cx + dx - 6, cy + dy - 5], [cx + dx + 6, cy + dy - 5], [cx + dx + 6, cy + dy + 5], [cx + dx - 6, cy + dy + 5], [cx + dx - 6, cy + dy - 5]], '#c9b490'); ficha(cx + dx, cy + dy, 7); }
    }
    { // Kanto: portal, refletores, estátuas e bandeiras no caminho
      const [cx, cy] = C('Kanto'), [a, b, c] = pos(cx, cy + 21);
      for (const dx of [-6.5, 6.5]) { m.caixa(a + dx, b, c, 3, 11, 3, '#e8e2d4', { mat: 8 }); m.bola(a + dx, b + 12.4, c, 1.5, 1.5, 1.5, '#e8b92c', 6, 0, 0); } m.caixa(a, b + 8.6, c, 16, 2.4, 2, '#6a5a9a'); m.caixa(a, b + 9.2, c + 1.1, 8, 1.2, 0.2, '#ffd34d');
      for (const [dx, dz] of [[-30, -20], [30, -20], [-32, 14], [32, 14]]) { const [d, e, f] = pos(cx + dx, cy + dz); m.tubo(d, e, f, 0.6, 0.35, 21, 6, '#b8bcc8'); m.caixa(d, e + 21, f, 4.4, 2.6, 0.8, '#fff2c0', { mat: 6 }); ficha(cx + dx, cy + dz, 2.5); }
      for (let i = 0; i < 4; i++) for (const lado of [-1, 1]) { const [d, e, f] = pos(cx + lado * 5.4, cy + 24 + i * 3.6); m.tubo(d, e, f, 0.2, 0.16, 6.4, 5, '#e8e8ee'); m.quad([d, e + 6.4, f], [d + lado * 2.8, e + 6, f], [d + lado * 2.8, e + 4.4, f], [d, e + 4.2, f], ['#e0463f', '#4f7fe8', '#f2c52c', '#58b84a'][i], { mat: 3, uv: [[0, 0], [1, 0], [1, 1], [0, 1]] }); }
    }
    // casas, moradores e postes em volta de cada cidade
    const QUANTAS = { Pewter: 15, Cerulean: 16, Vermilion: 16, Celadon: 16, Fuchsia: 5, Saffron: 0, Cinnabar: 7, Viridian: 18, Kanto: 6 };
    for (const [nome, total] of Object.entries(QUANTAS)) {
      const [cx, cy] = C(nome), pal = PALETAS[nome];
      for (let i = 0, n = 0; i < 900 && n < total; i++) {
        const ang = r() * TAU, raio = 0.45 + r() * 0.75, x = cx + Math.cos(ang) * 38 * raio, y = cy + Math.sin(ang) * 27 * raio - 2;
        const w = 5.2 + r() * 3, d = 4.6 + r() * 2;
        if (!livre(x, y, w * 0.68, { incl: 0.45 })) continue;
        const [a, b, c] = pos(x, y), [parede, telha] = pal[n % pal.length];
        casa(kit, a, b, c, { w, d, h: 3.4 + r() * (nome === 'Kanto' ? 1.5 : 3), parede, telha, giro: (r() - 0.5) * 0.9, fumaca: n % 6 === 2, jardim: r() < 0.7 });
        ficha(x, y, w * 0.74); n++;
      }
    }
    for (const nome of Object.keys(SPOTS)) {
      const [cx, cy] = C(nome); if (nome === 'Cinnabar') continue;
      for (let i = 0; i < 14; i++) { const t = i / 14 * TAU + 0.2, x = cx + Math.cos(t) * (nome === 'Kanto' ? 34 : 27), y = cy - 1 + Math.sin(t) * (nome === 'Kanto' ? 25 : 17.5); if (chao(x, y) < 1.8 || plano(x, y) > 0.5 || noLago(x, y, 1) || linhaDist(x, y, rio) < 5 || ocupado.some(([a, b, c]) => c < 12 && Math.hypot(x - a, y - b) < c * 0.7)) continue; const [a, b, c] = pos(x, y); poste(m, a, b, c); }
      for (let i = 0, n = 0; i < 80 && n < 14; i++) { const x = cx + (r() - 0.5) * 56, y = cy + (r() - 0.5) * 36; if (!livre(x, y, 0.7, { incl: 0.5 })) continue; const [a, b, c] = pos(x, y); pessoa(m, a, b, c, ['#d8453c', '#3a74c4', '#f2c22c', '#3f9a50', '#8f5fd0', '#f4f2ec'][n % 6]); n++; }
      if (nome === 'Celadon' || nome === 'Vermilion' || nome === 'Pewter' || nome === 'Viridian') for (let i = 0, n = 0; i < 200 && n < 3; i++) { const x = cx + (r() - 0.5) * 50, y = cy + (r() - 0.5) * 32; if (!livre(x, y, 3, { incl: 0.4 })) continue; const [a, b, c] = pos(x, y); banca(m, a, b, c, ['#d8453c', '#2f8f55', '#e8902c'][n]); ficha(x, y, 3.4); n++; }
    }

    // 2) fazendas: cercas, celeiro, silo, feno, espantalho e plantação em pé
    const plantas = [];
    CAMPOS.forEach(([cx, cy, w, h, a], k) => {
      const q = (u, v) => [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)];
      cerca(m, kit, [q(-w / 2 - 1.5, -h / 2 - 1.5), q(w / 2 + 1.5, -h / 2 - 1.5), q(w / 2 + 1.5, h / 2 + 1.5), q(-w / 2 - 1.5, h / 2 + 1.5), q(-w / 2 - 1.5, -h / 2 + 3)], '#c2a878');
      for (let u = -w / 2 + 1.2; u < w / 2 - 0.6; u += 2) for (let v = -h / 2 + 1; v < h / 2 - 0.6; v += 1.7) { if (Math.abs(u) < 1.2) continue; const [x, y] = q(u + (r() - 0.5) * 0.4, v); if (linhaDist(x, y, rota) < 3.5 || chao(x, y) < 1.5) continue; const ouro = u < 0 ? k % 2 === 0 : k % 2 === 1; plantas.push(wx(x), chao(x, y) - 0.1, wz(y), 0.8 + r() * 0.35, ...(ouro ? [1.7, 1.2, 0.45] : [0.75, 1.15, 0.5]), r() * 6.28); }
      const [ex, ey] = q((r() - 0.5) * w * 0.3, 0); const [sx, sy, sz] = pos(ex, ey); m.caixa(sx, sy, sz, 0.3, 3.6, 0.3, '#7a5230'); m.caixa(sx, sy + 2.6, sz, 2.8, 0.3, 0.3, '#7a5230'); m.caixa(sx, sy + 1.8, sz, 1.3, 1.3, 0.7, '#b8453a'); m.bola(sx, sy + 3.9, sz, 0.55, 0.55, 0.55, '#e8c88a', k, 0.2, 0); m.tubo(sx, sy + 4.25, sz, 1, 0, 0.8, 8, '#8a6a2c');
      for (const [u, v] of [[w / 2 + 10, 0], [-w / 2 - 10, 0], [0, -h / 2 - 10], [w / 2 + 8, h / 2 + 6], [-w / 2 - 8, -h / 2 - 6], [0, h / 2 + 10]]) {
        const [x, y] = q(u, v); if (!livre(x, y, 6, { incl: 0.5 })) continue;
        const [bx, by, bz] = pos(x, y); m.caixa(bx, by, bz, 8, 5.4, 6.4, '#a8382c', { mat: 8 }); m.telhado(bx, by + 5.4, bz, 9.2, 7.6, 3.6, '#5a4038', { lado: '#a8382c', mat: 7 });
        m.caixa(bx, by, bz + 3.3, 3, 3.8, 0.25, '#f2ead8'); m.caixa(bx, by + 0.1, bz + 3.42, 2.4, 3.3, 0.2, '#7a241c'); ficha(x, y, 7);
        if (livre(x + 8, y - 2, 2.6, { incl: 0.6 })) { const [c1, c2, c3] = pos(x + 8, y - 2); m.tubo(c1, c2, c3, 2.4, 2.4, 9.4, 14, '#c9ccd2', { mat: 8 }); m.bola(c1, c2 + 9.4, c3, 2.4, 1.9, 2.4, '#8f98a6', 3, 0, 1); ficha(x + 8, y - 2, 3); }
        for (let i = 0; i < 5; i++) { const hx = x - 7 + r() * 6, hy = y + 4 + r() * 5; if (!livre(hx, hy, 1.4, { incl: 0.6 })) continue; const [d, e, f] = pos(hx, hy); m.tubo(d, e, f, 1.35, 1.25, 1.5, 10, '#d9b44a', { tampa: '#e8c860' }); m.tubo(d, e + 1.5, f, 1.35, 0, 1, 10, '#c9a038'); ficha(hx, hy, 1.4); }
        break;
      }
    });
    // casas de sítio espalhadas pelas planícies
    for (let i = 0, n = 0; i < 2500 && n < 14; i++) {
      const x = 36 + r() * 290, y = 60 + r() * 280;
      if (!livre(x, y, 7, { incl: 0.25, alto: 10 })) continue;
      const [a, b, c] = pos(x, y), pal = [['#efe4cc', '#a8452f'], ['#e8e0d0', '#5a6f8a'], ['#f2e8d0', '#8a6a2c']][n % 3];
      casa(kit, a, b, c, { w: 5.4 + r() * 1.6, d: 4.8, h: 3.4, parede: pal[0], telha: pal[1], giro: (r() - 0.5) * 1.1, fumaca: n % 3 === 0 }); ficha(x, y, 6); n++;
    }
    // moinhos de vento
    const moinhos = [];
    for (const [px, py] of [[248, 240], [140, 296], [268, 108], [112, 226], [244, 326], [200, 232], [160, 120]]) {
      if (moinhos.length >= 3) break;
      for (let i = 0; i < 40; i++) {
        const x = px + (r() - 0.5) * 24, y = py + (r() - 0.5) * 24; if (!livre(x, y, 6, { incl: 0.5 })) continue;
        const [a, b, c] = pos(x, y); m.tubo(a, b, c, 3.4, 2.1, 12, 12, '#e6dccb', { mat: 8 }); m.tubo(a, b + 12, c, 2.7, 0, 3.4, 12, '#8f4a34', { mat: 7 }); m.caixa(a, b, c + 3.2, 1.6, 2.8, 0.4, '#5a3a22'); m.tubo(a, b + 11, c + 2.4, 0.5, 0.5, 0.9, 6, '#4a3626');
        moinhos.push([a, b + 11.6, c + 3.1]); ficha(x, y, 7); break;
      }
    }
    // rebanhos
    for (let g = 0, i = 0; g < 7 && i < 900; i++) {
      const x = 40 + r() * 280, y = 70 + r() * 260; if (!livre(x, y, 7, { incl: 0.25, alto: 10 })) continue;
      const tipo = g % 2 ? 'ovelha' : 'vaca';
      for (let k = 0; k < 6; k++) { const bx = x + (r() - 0.5) * 12, by = y + (r() - 0.5) * 9; if (!livre(bx, by, 1.2, { incl: 0.4 })) continue; const [a, b, c] = pos(bx, by); bicho(m, a, b, c, r() * 6.28, tipo); ficha(bx, by, 1.5); }
      g++;
    }

    // 3) águas: cais, barquinhos e pontes de pedra
    for (const [cx, cy, rx, ry] of LAGOS) {
      const bx = cx + rx * 0.5, by = cy + ry * 0.62;
      for (let i = 0; i < 8; i++) m.caixa(wx(bx + i * 0.2), 1.55, wz(by + i * 1.35), 3.4, 0.35, 1.2, i % 2 ? '#9a6e44' : '#ab7d4f');
      for (const [dx, dy] of [[-1.7, 0], [1.7, 0], [-1.1, 5], [2.3, 5]]) m.tubo(wx(bx + dx), -0.5, wz(by + dy), 0.35, 0.35, 3, 6, '#5d3f27');
      barquinho(m, wx(bx - 5), 1.15, wz(by + 1), 0.5, '#c0503a'); barquinho(m, wx(cx - rx * 0.45), 1.15, wz(cy - ry * 0.2), 2.4, '#e9dfc8');
    }
    for (let i = 1; i < rota.length; i++) for (let j = 1; j < rio.length; j++) {
      const [ax, ay] = rota[i - 1], [bx, by] = rota[i], [cx, cy] = rio[j - 1], [dx, dy] = rio[j], den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (!den) continue;
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den; if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const ix = ax + (bx - ax) * t, iy = ay + (by - ay) * t, g = Math.atan2(by - ay, bx - ax), P = gira(wx(ix), 0, wz(iy), g);
      for (let k = -6; k <= 6; k++) { const alt = 1.2 + Math.cos(k / 6 * 1.5708) * 2.2, p = P(k * 1.35, alt, 0); m.caixa(p[0], p[1], p[2], 1.45, 0.7, 6, '#b9ae98', { giro: g, mat: 8 }); for (const l of [-2.8, 2.8]) { const q = P(k * 1.35, alt + 0.7, l); m.caixa(q[0], q[1], q[2], 1.45, 0.95, 0.55, '#9a907c', { giro: g, mat: 8 }); } }
    }

    // 4) mar e praia
    for (let i = 0, n = 0; i < 5000 && n < 90; i++) { const x = 5 + r() * 350, y = 20 + r() * 430, d = litoral(x, y); if (d > -2 || d < -9 || linhaDist(x, y, rota) < 7) continue; const s = 0.7 + r() * r() * 2.8; m.bola(wx(x), -0.2, wz(y), s, s * 0.85, s, ['#7d766c', '#948b7e', '#6a645c'][n % 3], i, 0.65, 0); n++; }
    for (let i = 0, n = 0; i < 4000 && n < 22; i++) {
      const x = 30 + r() * 300, y = 200 + r() * 235, d = litoral(x, y), h = chao(x, y);
      if (d < 3 || d > 7 || h < 0.6 || h > 2.8 || linhaDist(x, y, rota) < 6 || ocupado.some(([a, b, c]) => Math.hypot(x - a, y - b) < c + 2)) continue;
      const [a, b, c] = pos(x, y), k = ['#e0463f', '#2f8fd8', '#f2b52c', '#3fae6a'][n % 4];
      m.tubo(a, b, c, 0.18, 0.18, 3.6, 5, '#e8e0d0'); for (let s = 0; s < 8; s++) { const t0 = s / 8 * TAU, t1 = (s + 1) / 8 * TAU; m.tri([a + Math.cos(t0) * 2.5, b + 3, c + Math.sin(t0) * 2.5], [a + Math.cos(t1) * 2.5, b + 3, c + Math.sin(t1) * 2.5], [a, b + 4.2, c], s % 2 ? '#f6f2ea' : k, { centro: [a, b, c] }); }
      m.caixa(a + 2.2, b + 0.35, c + 1.4, 1.5, 0.18, 2.8, k, { giro: r() }); pessoa(m, a - 1.8, b, c + 1.2, '#f2c22c'); ficha(x, y, 3.4); n++;
    }

    // 5) coisas miúdas, repetidas aos milhares
    const molde = f => { const k = kit.malha(); f(k); return new Float32Array(k.v); };
    const tufo = molde(k => { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, c = Math.cos(a), s = Math.sin(a); k.tri([c * 0.15 - s * 0.16, 0, s * 0.15 + c * 0.16], [c * 0.15 + s * 0.16, 0, s * 0.15 - c * 0.16], [c * 0.75, 1.15 + (i % 2) * 0.35, s * 0.75], i % 2 ? '#5f8f33' : '#4f7f2c', { mat: 12 }); } });
    const flor = molde(k => { for (const [x, z, h] of [[0, 0, 0.9], [0.8, 0.3, 0.65], [-0.6, 0.6, 0.75], [0.2, -0.75, 0.55], [-0.7, -0.35, 0.85]]) { k.tri([x - 0.05, 0, z], [x + 0.05, 0, z], [x, h, z], '#3c6b28', { mat: 12 }); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU, b = (i + 0.8) / 5 * TAU; k.tri([x, h, z], [x + Math.cos(a) * 0.34, h + 0.1, z + Math.sin(a) * 0.34], [x + Math.cos(b) * 0.34, h + 0.1, z + Math.sin(b) * 0.34], '#ffffff', { mat: 12 }); } } });
    const arbusto = molde(k => { k.bola(0, 0.75, 0, 1.15, 0.95, 1.15, '#35632a', 3, 0.45, 0); k.bola(0.85, 0.55, 0.35, 0.75, 0.65, 0.75, '#447534', 9, 0.4, 0); k.bola(-0.7, 0.5, -0.4, 0.7, 0.6, 0.7, '#2c5624', 14, 0.4, 0); });
    const seixo = molde(k => { k.bola(0, 0.25, 0, 0.85, 0.55, 0.7, '#8d857a', 5, 0.5, 0); k.bola(0.9, 0.12, 0.4, 0.4, 0.28, 0.35, '#a39a8c', 11, 0.4, 0); });
    const junco = molde(k => { for (let i = 0; i < 8; i++) { const a = i * 2.4, d = 0.15 + (i % 4) * 0.22, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 1.7 + (i % 3) * 0.55; k.tri([x - 0.1, 0, z], [x + 0.1, 0, z], [x * 1.6, h, z * 1.6], i % 2 ? '#6f8c34' : '#567326', { mat: 12 }); if (i % 3 === 0) k.tubo(x * 1.6, h - 0.1, z * 1.6, 0.17, 0.12, 0.65, 5, '#6a4424'); } });
    const vitoria = molde(k => { for (let i = 1; i < 10; i++) { const a = i / 11 * TAU, b = (i + 1) / 11 * TAU; k.tri([0, 0.02, 0], [Math.cos(a), 0, Math.sin(a)], [Math.cos(b), 0, Math.sin(b)], '#3f8a36', { mat: 12 }); } for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; k.tri([0.2, 0.1, 0.1], [0.2 + Math.cos(a) * 0.45, 0.4, 0.1 + Math.sin(a) * 0.45], [0.2 + Math.cos(a + 0.8) * 0.45, 0.4, 0.1 + Math.sin(a + 0.8) * 0.45], '#f4a8cc', { mat: 12 }); } });
    const colheita = molde(k => { for (let i = 0; i < 5; i++) { const a = i * 1.9, x = Math.cos(a) * 0.4, z = Math.sin(a) * 0.4; k.tri([x - 0.2, 0, z], [x + 0.2, 0, z], [x * 1.3, 1.1 + (i % 2) * 0.3, z * 1.3], '#a8964a', { mat: 12 }); } });

    const camadas = { tufo: [], flor: [], arbusto: [], seixo: [], junco: [], vitoria: [], colheita: plantas };
    const por = (l, x, y, h, s, tom) => l.push(wx(x), h, wz(y), s, tom[0], tom[1], tom[2], r() * 6.28);
    const solo = (x, y, folga) => {
      const h = chao(x, y);
      if (h < 1.7 || h > 18 || plano(x, y) > 0.7 || linhaDist(x, y, rota) < 4 || linhaDist(x, y, rio) < 6 || noLago(x, y, 2) || noCampo(x, y, 2) || Math.hypot(x - VULCAO[0], y - VULCAO[1]) < 24) return null;
      return ocupado.some(([a, b, c]) => c < 12 && Math.hypot(x - a, y - b) < c * folga) ? null : h;
    };
    for (let i = 0; i < 40000 && camadas.tufo.length < 8 * 6500; i++) { const x = 25 + r() * 320, y = 40 + r() * 390, h = solo(x, y, 0.85); if (h === null) continue; const t = 0.8 + r() * 0.45; por(camadas.tufo, x, y, h - 0.12, 0.55 + r() * 0.65, [t * (0.95 + r() * 0.35), t, t * 0.8]); }
    for (let n = 0, i = 0; n < 95 && i < 2500; i++) {
      const x = 35 + r() * 300, y = 55 + r() * 360; if (solo(x, y, 1) === null) continue;
      const tom = [[1, 0.95, 0.35], [1, 0.45, 0.7], [1, 1, 1], [0.75, 0.55, 1], [1, 0.55, 0.3]][n % 5];
      for (let k = 0; k < 15; k++) { const fx = x + (r() - 0.5) * 11, fy = y + (r() - 0.5) * 8, h = solo(fx, fy, 0.9); if (h !== null) por(camadas.flor, fx, fy, h - 0.1, 0.5 + r() * 0.45, tom); }
      n++;
    }
    for (let i = 0; i < 12000 && camadas.arbusto.length < 8 * 950; i++) { const x = 25 + r() * 320, y = 40 + r() * 390, h = solo(x, y, 1); if (h === null || kit.fbm(x / 19, y / 19 + 4, 3) < 0.5) continue; const t = 0.8 + r() * 0.4; por(camadas.arbusto, x, y, h - 0.2, 0.6 + r() * 0.8, [t, t, t * 0.9]); }
    for (let i = 0; i < 14000 && camadas.seixo.length < 8 * 520; i++) { const x = 15 + r() * 335, y = 25 + r() * 420, h = chao(x, y), d = litoral(x, y); const praia = d > 0.5 && d < 5 && h < 2.6, serra = h > 7 && h < 26; if ((!praia && !serra) || linhaDist(x, y, rota) < 4) continue; if (praia && r() < 0.6) continue; const t = 0.8 + r() * 0.45; por(camadas.seixo, x, y, h - 0.15, 0.4 + r() * r() * 1.3, [t, t, t]); }
    for (const [cx, cy, rx, ry] of LAGOS) {
      for (let i = 0; i < 90; i++) { const a = r() * TAU, k = 1.0 + r() * 0.2, x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k; if (y > cy + ry * 0.35 && x > cx + rx * 0.25) continue; if (r() < 0.25) por(camadas.seixo, x, y, chao(x, y) - 0.1, 0.5 + r() * 0.8, [1, 0.97, 0.92]); else por(camadas.junco, x, y, chao(x, y) - 0.15, 0.65 + r() * 0.6, [1, 1, 1]); }
      for (let i = 0; i < 30; i++) { const a = r() * TAU, k = 0.25 + Math.sqrt(r()) * 0.58, x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k; if (y > cy + ry * 0.2 && x > cx + rx * 0.1) continue; por(camadas.vitoria, x, y, chao(x, y) + 0.12, 0.7 + r() * 0.9, [0.9 + r() * 0.2, 1, 0.9]); }
    }
    for (let j = 1; j < rio.length; j++) for (const lado of [-1, 1]) {
      const [ax, ay] = rio[j - 1], [bx, by] = rio[j], L = Math.hypot(bx - ax, by - ay) || 1;
      for (let k = 0; k < 3; k++) { if (r() < 0.45) continue; const t = r(), off = (4.6 + r() * 1.6) * lado, x = ax + (bx - ax) * t - (by - ay) / L * off, y = ay + (by - ay) * t + (bx - ax) / L * off; if (litoral(x, y) < 2 || linhaDist(x, y, rota) < 5 || noLago(x, y, 1)) continue; if (r() < 0.3) por(camadas.seixo, x, y, chao(x, y) - 0.1, 0.4 + r() * 0.8, [1, 1, 1]); else por(camadas.junco, x, y, chao(x, y) - 0.15, 0.5 + r() * 0.5, [1, 1, 1]); }
    }
    const moldes = { tufo, flor, arbusto, seixo, junco, vitoria, colheita };
    const miudezas = Object.entries(camadas).filter(([, l]) => l.length).map(([tipo, l]) => ({ tipo, vertices: moldes[tipo], instancias: new Float32Array(l), n: l.length / 8, sombra: tipo === 'arbusto' }));

    return { miudezas, moveis: moveis(kit, moinhos) };
  }

  // ── o que se mexe: cada item devolve onde desenhar a peça num instante t ──
  function moveis(kit, moinhos) {
    const { wx, wz, LAGOS } = kit, lista = [];
    const peca = f => { const k = kit.malha(); f(k); return new Float32Array(k.v); };
    const pas = peca(k => { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a), q = (d, l) => [c * d - s * l, s * d + c * l, 0]; k.quad(q(0, -0.2), q(10, -0.2), q(10, 0.2), q(0, 0.2), '#6a4a30'); k.quad(q(2.4, 0.2), q(9.8, 0.2), q(9.8, 2.1), q(2.4, 1.5), '#f2ebdc'); for (let j = 3; j < 10; j += 1.7) k.quad(q(j, 0.2), q(j + 0.2, 0.2), q(j + 0.2, 2), q(j, 2), '#8a6a48'); } k.bola(0, 0, 0.2, 0.7, 0.7, 0.7, '#4a3626', 1, 0, 0); });
    if (moinhos.length) lista.push({ vertices: pas, sombra: true, em: t => moinhos.map(([x, y, z], i) => ({ x, y, z, helice: t * (1.1 + i * 0.17) + i })) });
    const pato = peca(k => { k.bola(0, 0.5, 0, 1.1, 0.6, 0.75, '#f4f0e4', 2, 0.1, 0); k.bola(0.9, 1.25, 0, 0.45, 0.45, 0.42, '#f4f0e4', 5, 0, 0); k.tri([1.3, 1.25, -0.2], [1.85, 1.15, 0], [1.3, 1.25, 0.2], '#f29a20'); k.tri([-1, 0.7, -0.35], [-1.75, 1.15, 0], [-1, 0.7, 0.35], '#e4dccb'); });
    lista.push({ vertices: pato, em: t => LAGOS.flatMap(([cx, cy, rx, ry], j) => [0, 1, 2, 3].map(i => { const a = t * (0.17 + i * 0.018) * (j ? -1 : 1) + i * 1.7, x = cx + Math.cos(a) * rx * (0.34 + i * 0.07), y = cy + Math.sin(a) * ry * (0.34 + i * 0.07); return { x: wx(x), y: 1.15 + Math.sin(t * 2 + i) * 0.07, z: wz(y), escala: i ? 0.65 : 0.85, giro: Math.atan2(Math.cos(a) * ry * (j ? -1 : 1), -Math.sin(a) * rx * (j ? -1 : 1)) }; })) });
    const ave = peca(k => { for (const l of [-1, 1]) { k.tri([0.5, 0, 0], [-0.5, 0, 0], [-0.4, 0, l * 2.4], '#f4f4f2', { mat: 11 }); k.tri([-0.4, 0, l * 2.4], [-0.9, 0, l * 3], [-0.7, 0, l * 1.8], '#3a3f48', { mat: 11 }); } k.bola(0, 0, 0, 0.9, 0.35, 0.35, '#f4f4f2', 3, 0, 0); });
    lista.push({ vertices: ave, sombra: true, alto: true, em: t => [[0, 7, 52, 0], [190, 5, 44, 2.4], [330, 4, 60, 4.3]].flatMap(([cz, n, alt, fase], g) => Array.from({ length: n }, (_, i) => { const px = ((t * (10 + g * 2) + fase * 90) % 520) - 260, atras = Math.ceil(i / 2) * 5, lado = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 4; return { x: px - atras, y: alt + Math.sin(t * 1.4 + i) * 1.2, z: wz(110 + cz * 0.8) + lado - px * 0.18, escala: 0.8, giro: -0.17 }; })) });
    const balao = peca(k => { for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, b = (i + 1) / 16 * TAU, cor = i % 2 ? '#e8483c' : '#f6d046', P = (t, rr, y) => [Math.cos(t) * rr, y, Math.sin(t) * rr]; const perfil = [[1.6, 0], [4.6, 3], [6.4, 6.4], [5.8, 9.6], [3.6, 11.8], [0.1, 12.8]]; for (let j = 1; j < perfil.length; j++) { const [r0, y0] = perfil[j - 1], [r1, y1] = perfil[j]; k.quad(P(a, r0, y0), P(b, r0, y0), P(b, r1, y1), P(a, r1, y1), cor, { centro: [0, (y0 + y1) / 2, 0] }); } } for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.caixa(x, -3.4, z, 0.14, 3.6, 0.14, '#4a3626'); k.caixa(0, -5, 0, 2.8, 1.8, 2.8, '#8a5a2c', { mat: 8 }); });
    lista.push({ vertices: balao, sombra: true, alto: true, em: t => [{ x: Math.sin(t * 0.045 + 2.2) * 150, y: 50 + Math.sin(t * 0.4) * 2.2, z: Math.cos(t * 0.031 + 1) * 130 + 40, escala: 0.75, giro: t * 0.05 }] });
    const golfinho = peca(k => { k.bola(0, 0, 0, 2.6, 0.85, 0.8, '#6f8ca8', 6, 0.05, 1); k.tri([-0.3, 0.7, 0], [-1.3, 2, 0], [-1.4, 0.6, 0], '#5a7690'); k.tri([-2.4, 0, 0], [-3.7, 0.2, -1.1], [-3.2, 0, 0], '#5a7690'); k.tri([-2.4, 0, 0], [-3.7, 0.2, 1.1], [-3.2, 0, 0], '#5a7690'); k.tri([2.4, 0.1, -0.25], [3.6, -0.15, 0], [2.4, 0.1, 0.25], '#8aa4bc'); });
    lista.push({ vertices: golfinho, em: t => [[338, 262, 0, 2.2], [150, 428, 2.6, 0.4], [18, 242, 5.1, 1.3]].flatMap(([x, y, fase, g]) => [0, 1].map(i => { const v = ((t + fase + i * 0.45) % 7) / 1.6; return v > 1 ? null : { x: wx(x) + Math.cos(g) * (v - 0.5) * 16 + i * 4, y: Math.sin(v * Math.PI) * 5.2 - 1.2, z: wz(y) - Math.sin(g) * (v - 0.5) * 16 + i * 3, escala: 0.85, giro: -g }; }).filter(Boolean)) });
    return lista;
  }

  window.wsDetalhes = { PISO, casa, pintar, montar };
})();
