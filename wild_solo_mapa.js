// ================================================================
// MyDeck — Modo solo: MAPA DE KANTO em camadas (alpha, 28/11/2026)
// ================================================================
// Desenho próprio, todo por código (SVG). Seis camadas empilhadas em alturas diferentes (mar, terra, relevo, cidades,
// placas e céu): ao mover o dedo, o mouse ou o celular, o mapa inclina e as camadas andam em velocidades diferentes.
// Um sol acompanha o movimento e comanda a luz: direção e tamanho das sombras, face clara e escura das montanhas e
// prédios, reflexo no mar, tom de fim de tarde e janelas acesas quando ele está baixo.
//
// Uso: const mapa = wsMapa.render(elemento, { cities, badges, open, onCity, types });  mapa.destroy();
// Para trocar uma camada por arte melhor depois, basta substituir a função da camada: o movimento e a luz continuam.
// ================================================================
(function () {
  'use strict';
  const W = 360, H = 460;

  // posições no NOSSO mapa (o caminho serpenteia na ordem em que as cidades abrem)
  const SPOTS = {
    Pewter: [76, 118], Cerulean: [188, 90], Vermilion: [290, 152], Celadon: [208, 190], Fuchsia: [288, 276],
    Saffron: [212, 342], Cinnabar: [66, 400], Viridian: [78, 286], Kanto: [150, 252],
  };

  // sorteio sempre igual: o mapa não muda de uma abertura para outra
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  const f = n => Math.round(n * 10) / 10;
  const pts = list => list.map(p => `${f(p[0])},${f(p[1])}`).join(' ');
  const poly = (list, fill, extra) => `<polygon points="${pts(list)}" fill="${fill}" ${extra || ''}/>`;

  // Cada camada junta peças em grupos que a luz controla:
  //   sombra[h]  = sombras no chão, deslocadas para longe do sol (h = altura do objeto)
  //   esq / dir  = escurecimento das faces voltadas para a esquerda / direita
  //   janela     = luzes que acendem no fim da tarde
  function novaCamada() { return { base: '', sombra: { baixo: '', medio: '', alto: '' }, esq: '', dir: '', janela: '', topo: '' }; }
  function montar(c) {
    return Object.entries(c.sombra).map(([h, s]) => (s ? `<g class="wm-sombra" data-h="${h}" fill="#0a1a14" opacity=".28">${s}</g>` : '')).join('') +
      c.base + `<g class="wm-esq" fill="#101b2e">${c.esq}</g><g class="wm-dir" fill="#101b2e">${c.dir}</g>` +
      `<g class="wm-janela" fill="#ffe9a3">${c.janela}</g>` + c.topo;
  }
  const sombraOval = (c, h, x, y, rx, ry) => { c.sombra[h] += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}"/>`; };

  // bloco em perspectiva: frente, lateral direita e telhado/topo
  function bloco(c, x, y, w, h, d, cor, opts) {
    const o = opts || {};
    const l = x - w / 2, r = x + w / 2, t = y - h, dx = d, dy = d * 0.55;
    const lado = [[r, t], [r + dx, t - dy], [r + dx, y - dy], [r, y]];
    const frente = [[l, t], [r, t], [r, y], [l, y]];
    sombraOval(c, o.h || 'medio', x + dx / 2, y, (w + dx) / 1.7, Math.max(3, d * 0.8));
    c.base += poly(frente, cor[0]) + poly(lado, cor[1]);
    if (o.telhado) c.base += poly([[l - 1, t], [x, t - o.telhado], [r + 1, t]], cor[2]) + poly([[x, t - o.telhado], [x + dx, t - o.telhado - dy], [r + dx + 1, t - dy], [r + 1, t]], cor[3] || cor[2]);
    else c.base += poly([[l, t], [l + dx, t - dy], [r + dx, t - dy], [r, t]], cor[2]);
    c.esq += poly(frente, '', 'opacity=".55"').replace('fill=""', '');
    c.dir += poly(lado, '', '').replace('fill=""', '');
    if (o.janelas) {
      const [cols, rows] = o.janelas, jw = w / (cols * 2 + 1), jh = h / (rows * 2 + 1);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const q = `<rect x="${f(l + jw * (i * 2 + 1))}" y="${f(t + jh * (j * 2 + 1))}" width="${f(jw)}" height="${f(jh)}"`;
        c.base += `${q} fill="#2d4565" opacity=".85"/>`;
        c.janela += `${q}/>`;
      }
    }
  }

  function montanha(c, x, y, w, h, tom, neve) {
    const pico = [x, y - h], esq = [x - w / 2, y], dir = [x + w / 2, y], meio = [x + w * 0.08, y];
    sombraOval(c, h > 40 ? 'alto' : 'medio', x, y, w * 0.55, h * 0.16);
    c.base += poly([pico, meio, esq], tom[0]) + poly([pico, dir, meio], tom[1]);
    if (neve) {
      const k = 0.34, a = [x - (w / 2) * k, y - h * (1 - k)], b = [x + (w / 2) * k, y - h * (1 - k)];
      c.base += poly([pico, [x + 2, y - h * (1 - k) + 4], [x - 3, y - h * (1 - k) - 1], a], '#f4f8ff') + poly([pico, b, [x + 7, y - h * (1 - k) - 2], [x + 2, y - h * (1 - k) + 4]], '#d5e2f2');
    }
    c.esq += `<polygon points="${pts([pico, meio, esq])}"/>`;
    c.dir += `<polygon points="${pts([pico, dir, meio])}"/>`;
  }

  function arvore(c, x, y, s, tipo) {
    sombraOval(c, 'baixo', x, y + 0.5, s * 0.62, s * 0.22);
    c.base += `<rect x="${f(x - s * 0.09)}" y="${f(y - s * 0.45)}" width="${f(s * 0.18)}" height="${f(s * 0.45)}" fill="#6b4a2b"/>`;
    if (tipo === 'pinheiro') {
      for (let k = 0; k < 2; k++) {
        const base = y - s * (0.35 + k * 0.38), topo = base - s * 0.7, larg = s * (0.52 - k * 0.12);
        c.base += poly([[x, topo], [x - larg, base], [x, base]], '#2f7d4a') + poly([[x, topo], [x, base], [x + larg, base]], '#246238');
        c.dir += `<polygon points="${pts([[x, topo], [x, base], [x + larg, base]])}"/>`;
        c.esq += `<polygon points="${pts([[x, topo], [x - larg, base], [x, base]])}" opacity=".7"/>`;
      }
    } else {
      const cor = tipo === 'flor' ? '#7fbf4d' : '#3f9a4c';
      c.base += `<circle cx="${f(x)}" cy="${f(y - s * 0.78)}" r="${f(s * 0.46)}" fill="${cor}"/><circle cx="${f(x - s * 0.14)}" cy="${f(y - s * 0.92)}" r="${f(s * 0.2)}" fill="#ffffff" opacity=".18"/>`;
      if (tipo === 'flor') c.base += `<circle cx="${f(x + s * 0.15)}" cy="${f(y - s * 0.68)}" r="${f(s * 0.1)}" fill="#ffd1e8"/><circle cx="${f(x - s * 0.2)}" cy="${f(y - s * 0.65)}" r="${f(s * 0.09)}" fill="#fff2a8"/>`;
      c.dir += `<path d="M${f(x)} ${f(y - s * 1.24)} a${f(s * 0.46)} ${f(s * 0.46)} 0 0 1 0 ${f(s * 0.92)} z"/>`;
      c.esq += `<path d="M${f(x)} ${f(y - s * 1.24)} a${f(s * 0.46)} ${f(s * 0.46)} 0 0 0 0 ${f(s * 0.92)} z" opacity=".7"/>`;
    }
  }
  function bosque(c, cx, cy, rx, ry, n, s, tipo, semente) {
    const r = rng(semente), lista = [];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      lista.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, s * (0.75 + r() * 0.5)]);
    }
    lista.sort((a, b) => a[1] - b[1]).forEach(([x, y, t]) => {
      if (Object.values(SPOTS).some(([px, py]) => Math.abs(x - px) < 24 && y > py - 34 && y < py + 20)) return; // não cobre cidade
      arvore(c, x, y, t, tipo);
    });
  }

  // ── camada 0: mar ─────────────────────────────────────────────
  function camadaMar() {
    const r = rng(7);
    let ondas = '';
    for (let i = 0; i < 70; i++) {
      const x = r() * (W + 40) - 20, y = r() * (H + 20) - 10, w = 5 + r() * 9;
      ondas += `<path class="wm-onda" style="animation-delay:${f(-r() * 4)}s" d="M${f(x)} ${f(y)} q${f(w / 2)} -3 ${f(w)} 0 t${f(w)} 0" fill="none" stroke="#bfe9ff" stroke-width="1" stroke-linecap="round" opacity=".35"/>`;
    }
    const barco = (x, y, cor, atraso) => `<g class="wm-boia" style="animation-delay:${atraso}s"><path d="M${x - 11} ${y} h22 l-5 7 h-12 z" fill="#7a4b2a"/><path d="M${x} ${y - 17} v16 h-9 z" fill="${cor}"/><path d="M${x + 1} ${y - 13} v12 h7 z" fill="#f4f4f4"/><path d="M${x - 16} ${y + 9} q8 -3 16 0 t16 0" fill="none" stroke="#dff4ff" opacity=".6"/></g>`;
    return `<defs><linearGradient id="wm-mar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d86b8"/><stop offset=".6" stop-color="#17608f"/><stop offset="1" stop-color="#0d3f66"/></linearGradient>
      <radialGradient id="wm-brilho"><stop offset="0" stop-color="#fff6cf" stop-opacity=".95"/><stop offset="1" stop-color="#fff6cf" stop-opacity="0"/></radialGradient></defs>
      <rect x="-40" y="-40" width="${W + 80}" height="${H + 80}" fill="url(#wm-mar)"/>
      <ellipse class="wm-reflexo" cx="180" cy="60" rx="120" ry="70" fill="url(#wm-brilho)" opacity=".4"/>
      ${ondas}${barco(332, 396, '#e8504f', 0)}${barco(144, 428, '#f2b134', -1.4)}${barco(26, 330, '#6c8cff', -2.2)}
      <g fill="#9fc9de" opacity=".8"><path d="M318 440 q9 -9 20 -3 q-6 1 -8 5 q-7 3 -12 -2 z"/><circle cx="341" cy="431" r="1.6"/><circle cx="344" cy="427" r="1.1"/></g>`;
  }

  // ── camada 1: terra, praias, águas e estradas ─────────────────
  const CONTINENTE = 'M30 70 C58 36 112 62 150 48 S214 30 250 56 S318 58 334 104 S322 150 336 186 S330 236 338 282 S300 336 274 332 S262 372 220 374 S168 372 148 344 S108 332 74 336 S28 322 32 280 S54 240 40 206 S14 168 30 132 S18 94 30 70 Z';
  const ILHA = 'M26 392 C30 368 60 362 82 370 S114 392 106 412 S76 438 52 430 S22 412 26 392 Z';
  function camadaTerra(ordem) {
    const r = rng(23);
    let capim = '';
    for (let i = 0; i < 260; i++) {
      const x = 40 + r() * 280, y = 66 + r() * 268;
      capim += `<path d="M${f(x)} ${f(y)} l1.5 -3.5 l1.5 3.5" fill="none" stroke="${r() < 0.5 ? '#2f6e3a' : '#7cbf63'}" stroke-width=".8" opacity=".7"/>`;
    }
    const caminho = ordem.map((nome, i) => `${i ? 'L' : 'M'}${SPOTS[nome][0]} ${SPOTS[nome][1] + 4}`).join(' ');
    let rotas = '';
    for (let i = 0; i < ordem.length - 1; i++) {
      const a = SPOTS[ordem[i]], b = SPOTS[ordem[i + 1]], x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2 + 4;
      rotas += `<g><circle cx="${f(x)}" cy="${f(y)}" r="6" fill="#fdf3d2" stroke="#8a6a35"/><text x="${f(x)}" y="${f(y + 2.6)}" text-anchor="middle" class="wm-rota">${i + 1}</text></g>`;
    }
    const campo = (x, y, w, h, cor) => `<g transform="rotate(-8 ${x} ${y})"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="2" fill="${cor}"/>${Array.from({ length: Math.floor(h / 4) }, (_, i) => `<line x1="${x - w / 2 + 2}" x2="${x + w / 2 - 2}" y1="${y - h / 2 + 3 + i * 4}" y2="${y - h / 2 + 3 + i * 4}" stroke="#7d6a2a" stroke-width=".7" opacity=".6"/>`).join('')}</g>`;
    return `<defs><linearGradient id="wm-grama" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#6fb35b"/><stop offset=".55" stop-color="#4f9a4b"/><stop offset="1" stop-color="#3b7f43"/></linearGradient></defs>
      <g class="wm-sombra" data-h="alto" fill="#06212f" opacity=".45"><path d="${CONTINENTE}"/><path d="${ILHA}"/></g>
      <g fill="none" stroke="#bfeaff" stroke-linejoin="round"><path class="wm-espuma" d="${CONTINENTE}" stroke-width="15" opacity=".18"/><path class="wm-espuma" d="${ILHA}" stroke-width="13" opacity=".18"/></g>
      <g fill="#8a6b45"><path d="${CONTINENTE}" transform="translate(0 7)"/><path d="${ILHA}" transform="translate(0 7)"/></g>
      <g fill="url(#wm-grama)" stroke="#ecd89a" stroke-width="5" stroke-linejoin="round"><path d="${CONTINENTE}"/><path d="${ILHA}" fill="#8c8a5a"/></g>
      ${capim}
      <ellipse cx="112" cy="112" rx="66" ry="38" fill="#8f9a72" opacity=".75"/>
      <ellipse cx="288" cy="282" rx="44" ry="34" fill="#9bb04c" opacity=".7"/>
      ${campo(262, 222, 34, 22, '#d6bd5b')}${campo(122, 316, 30, 18, '#c9b14e')}${campo(246, 124, 26, 16, '#a9c25a')}
      <g fill="none" stroke-linecap="round"><path d="M168 44 C160 66 196 72 188 92 S150 118 164 142 S236 150 246 178 S306 196 336 214" stroke="#d9eec2" stroke-width="9" opacity=".6"/>
        <path class="wm-rio" d="M168 44 C160 66 196 72 188 92 S150 118 164 142 S236 150 246 178 S306 196 336 214" stroke="#47a9dc" stroke-width="6"/></g>
      <ellipse cx="228" cy="82" rx="22" ry="13" fill="#47a9dc" stroke="#d9eec2" stroke-width="2.5"/>
      <ellipse cx="108" cy="206" rx="17" ry="10" fill="#47a9dc" stroke="#d9eec2" stroke-width="2"/>
      <path d="${caminho}" fill="none" stroke="#7a5a2e" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" opacity=".55"/>
      <path d="${caminho}" fill="none" stroke="#f2dfa6" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${caminho}" fill="none" stroke="#a9823f" stroke-width="1" stroke-dasharray="3 5"/>
      ${rotas}
      <g class="wm-sombra-nuvem" fill="#06212f" opacity=".16"><ellipse class="wm-deriva-1" cx="90" cy="150" rx="40" ry="14"/><ellipse class="wm-deriva-2" cx="260" cy="300" rx="48" ry="16"/></g>`;
  }

  // ── camada 2: montanhas e florestas ───────────────────────────
  function camadaRelevo() {
    const c = novaCamada();
    const rocha = ['#9a8f80', '#7d7266'], escura = ['#857a6d', '#6a6055'];
    montanha(c, 46, 92, 38, 40, rocha, true); montanha(c, 112, 84, 50, 56, escura, true); montanha(c, 140, 86, 34, 34, rocha, false);
    montanha(c, 46, 140, 30, 26, escura, false); montanha(c, 84, 82, 34, 30, rocha, false);
    montanha(c, 300, 96, 34, 32, rocha, true); montanha(c, 274, 90, 26, 22, escura, false);
    montanha(c, 44, 196, 30, 24, rocha, false); montanha(c, 118, 152, 22, 18, escura, false);
    bosque(c, 74, 262, 42, 44, 62, 13, 'pinheiro', 11);       // floresta de Viridian
    bosque(c, 78, 316, 40, 18, 22, 12, 'pinheiro', 12);
    bosque(c, 198, 156, 32, 18, 16, 11, 'flor', 13);          // jardins de Celadon
    bosque(c, 316, 300, 22, 26, 12, 11, 'copa', 14);
    bosque(c, 146, 332, 26, 14, 10, 11, 'copa', 15);
    bosque(c, 130, 62, 30, 9, 8, 10, 'pinheiro', 16);
    bosque(c, 250, 316, 20, 12, 7, 10, 'copa', 17);
    bosque(c, 316, 124, 16, 14, 6, 10, 'copa', 18);
    return montar(c);
  }

  // ── camada 3: marcos de cada cidade ───────────────────────────
  const casa = (c, x, y, s, telhado) => bloco(c, x, y, 11 * s, 8 * s, 4 * s, ['#f3e6cd', '#cbb995', telhado[0], telhado[1]], { telhado: 6 * s, h: 'baixo', janelas: [2, 1] });
  const bandeira = (x, y, cor, atraso) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 16}" stroke="#e9e9e9" stroke-width="1.2"/><path class="wm-bandeira" style="animation-delay:${atraso}s;transform-origin:${x}px ${y - 13}px" d="M${x} ${y - 16} q5 -2 10 1 q-4 2 -10 5 z" fill="${cor}"/>`;
  const MARCOS = {
    // museu com colunas e pedras
    Pewter(c, x, y) {
      for (const [dx, dy, s] of [[-28, 6, 7], [-22, 12, 4], [27, 9, 6]]) {
        sombraOval(c, 'baixo', x + dx, y + dy, s, s * 0.35);
        c.base += poly([[x + dx - s, y + dy], [x + dx - s * 0.5, y + dy - s], [x + dx + s * 0.4, y + dy - s * 1.1], [x + dx + s, y + dy]], '#a8a095') + poly([[x + dx, y + dy], [x + dx + s * 0.4, y + dy - s * 1.1], [x + dx + s, y + dy]], '#857d72');
      }
      bloco(c, x - 3, y, 34, 4, 9, ['#d9d2c3', '#b5ad9d', '#eee8da'], { h: 'baixo' });
      bloco(c, x - 3, y - 4, 29, 13, 8, ['#8f8674', '#a99f8d', '#c9c1b0']);
      for (let i = 0; i < 5; i++) c.topo += `<rect x="${x - 16 + i * 6.4}" y="${y - 17}" width="2.6" height="13" fill="#f7f3ea"/>`;
      c.topo += poly([[x - 19, y - 17], [x - 3, y - 29], [x + 13, y - 17]], '#e8e0cf', 'stroke="#a99f8d"') + `<circle cx="${x - 3}" cy="${y - 21}" r="2.6" fill="#b6a136"/>`;
    },
    // casas de telhado azul, fonte e ponte
    Cerulean(c, x, y) {
      c.base += `<path d="M${x - 30} ${y + 8} q14 -10 28 0" fill="none" stroke="#c9774a" stroke-width="5"/><path d="M${x - 30} ${y + 5} q14 -10 28 0" fill="none" stroke="#f0a972" stroke-width="1.5"/>`;
      casa(c, x - 9, y, 1.25, ['#3f7fd0', '#2e62a8']); casa(c, x + 13, y - 3, 1, ['#58a6e8', '#3f7fd0']);
      c.topo += `<ellipse cx="${x + 5}" cy="${y + 8}" rx="9" ry="4" fill="#7fd0f5" stroke="#f4f4f4" stroke-width="1.6"/><path class="wm-jato" d="M${x + 5} ${y + 7} q-5 -12 -8 -1 M${x + 5} ${y + 7} q5 -12 8 -1 M${x + 5} ${y + 7} v-11" fill="none" stroke="#e6f8ff" stroke-width="1.2"/>`;
    },
    // porto: píer, navio e farol
    Vermilion(c, x, y) {
      c.base += `<g fill="#9b6a3d"><rect x="${x + 14}" y="${y + 3}" width="34" height="5"/><rect x="${x + 30}" y="${y + 8}" width="3" height="7"/><rect x="${x + 44}" y="${y + 8}" width="3" height="7"/></g>`;
      c.topo += `<g class="wm-boia"><path d="M${x + 24} ${y + 17} h42 l-7 11 h-28 z" fill="#d0473f"/><path d="M${x + 24} ${y + 17} h42 l-2 3 h-38 z" fill="#f2f2f2"/><rect x="${x + 34}" y="${y + 9}" width="20" height="8" fill="#f2f2f2"/><rect x="${x + 40}" y="${y + 3}" width="5" height="6" fill="#2d2f3a"/><circle class="wm-fumaca" cx="${x + 43}" cy="${y - 1}" r="2.6" fill="#e8edf2"/></g>`;
      casa(c, x - 16, y + 2, 1.1, ['#e8803a', '#c0632a']);
      bloco(c, x + 4, y, 9, 26, 3, ['#f7f4ec', '#d3cfc2', '#d0473f'], { h: 'alto' });
      c.topo += `<rect x="${x - 0.5}" y="${y - 20}" width="9" height="4" fill="#d0473f"/><rect x="${x - 0.5}" y="${y - 11}" width="9" height="4" fill="#d0473f"/><rect x="${x + 1}" y="${y - 32}" width="6" height="6" fill="#ffe27a" stroke="#6b4a2b"/><path d="M${x} ${y - 32} l4 -5 4 5 z" fill="#d0473f"/><path class="wm-facho" style="transform-origin:${x + 4}px ${y - 29}px" d="M${x + 4} ${y - 29} l46 -11 v22 z" fill="#fff3b0"/>`;
    },
    // loja de departamentos e canteiros
    Celadon(c, x, y) {
      bloco(c, x - 4, y, 24, 27, 8, ['#dcefd5', '#a9cfa0', '#7ac74c'], { janelas: [3, 3], h: 'alto' });
      c.topo += `<rect x="${x - 12}" y="${y - 33}" width="16" height="6" rx="1" fill="#2f7d4a" stroke="#fdf3d2"/><circle cx="${x - 4}" cy="${y - 30}" r="1.8" fill="#ffd1e8"/>`;
      casa(c, x + 18, y + 3, 0.95, ['#5dbb63', '#3f9a4c']);
      const r = rng(41);
      for (let i = 0; i < 22; i++) c.topo += `<circle cx="${f(x - 28 + r() * 22)}" cy="${f(y + 3 + r() * 9)}" r="1.4" fill="${['#ff7fb0', '#fff06a', '#ffffff', '#ff9c5b'][i % 4]}"/>`;
    },
    // safári: portal, cerca, tenda e um bicho pastando
    Fuchsia(c, x, y) {
      for (let i = 0; i < 9; i++) c.base += `<rect x="${x - 34 + i * 8}" y="${y + 6}" width="2" height="8" fill="#b98a54"/>`;
      c.base += `<rect x="${x - 34}" y="${y + 8}" width="66" height="1.6" fill="#b98a54"/>`;
      sombraOval(c, 'medio', x - 12, y, 15, 4);
      c.base += poly([[x - 27, y], [x - 13, y - 22], [x + 1, y]], '#c0569a') + poly([[x - 13, y - 22], [x - 6, y], [x - 20, y]], '#f4d7ea') + poly([[x - 13, y - 22], [x + 1, y], [x - 6, y]], '#97407a');
      c.dir += `<polygon points="${pts([[x - 13, y - 22], [x + 1, y], [x - 6, y]])}"/>`;
      c.esq += `<polygon points="${pts([[x - 27, y], [x - 13, y - 22], [x - 20, y]])}"/>`;
      c.topo += `<g fill="#8a5a30"><rect x="${x + 6}" y="${y - 20}" width="3.4" height="21"/><rect x="${x + 25}" y="${y - 20}" width="3.4" height="21"/><rect x="${x + 3}" y="${y - 25}" width="29" height="7" rx="2"/></g><circle cx="${x + 17.5}" cy="${y - 21.5}" r="2.4" fill="#ffd166"/>
        <g fill="#e2b45a"><ellipse cx="${x + 18}" cy="${y - 2}" rx="7" ry="4"/><path d="M${x + 22} ${y - 3} l4 -12 3 1 -3 12 z"/><circle cx="${x + 28}" cy="${y - 15}" r="2.4"/><rect x="${x + 13}" y="${y}" width="1.6" height="6"/><rect x="${x + 21}" y="${y}" width="1.6" height="6"/></g>`;
      c.topo += bandeira(x + 3.5, y - 24, '#ff7fb0', -0.3) + bandeira(x + 31.5, y - 24, '#ffd166', -0.8);
    },
    // centro: arranha-céus
    Saffron(c, x, y) {
      bloco(c, x - 22, y + 2, 12, 24, 5, ['#f2d7a0', '#cfae73', '#e8b84a'], { janelas: [2, 4], h: 'alto' });
      bloco(c, x - 4, y - 2, 14, 40, 6, ['#cfe0ee', '#9cb6cc', '#e8f2fa'], { janelas: [3, 6], h: 'alto' });
      bloco(c, x + 15, y + 3, 12, 29, 5, ['#f4c6a8', '#d49a77', '#f95587'], { janelas: [2, 5], h: 'alto' });
      bloco(c, x + 30, y + 6, 9, 15, 4, ['#e9e2d0', '#c4bba4', '#8f86a8'], { janelas: [2, 2] });
      c.topo += `<line x1="${x - 1}" y1="${y - 45}" x2="${x - 1}" y2="${y - 56}" stroke="#e9e9e9" stroke-width="1.2"/><circle class="wm-pisca" cx="${x - 1}" cy="${y - 57}" r="1.8" fill="#ff5a4f"/>`;
    },
    // ilha do vulcão
    Cinnabar(c, x, y) {
      montanha(c, x + 8, y + 2, 56, 40, ['#7a4a3a', '#5c342a'], false);
      c.topo += `<ellipse cx="${x + 8}" cy="${y - 37}" rx="8" ry="2.8" fill="#2a1512"/><ellipse class="wm-lava" cx="${x + 8}" cy="${y - 37}" rx="5.5" ry="1.8" fill="#ff7a1a"/>
        <path class="wm-lava" d="M${x + 5} ${y - 36} q-3 10 -8 17 t-5 15" fill="none" stroke="#ff8f1f" stroke-width="2.2" stroke-linecap="round"/>
        ${[0, 1, 2, 3].map(i => `<circle class="wm-fumaca" style="animation-delay:${-i * 1.1}s" cx="${x + 8 + i}" cy="${y - 43}" r="${4 + i % 2 * 2}" fill="#cfc8c4"/>`).join('')}`;
      casa(c, x - 22, y + 8, 0.9, ['#ee8130', '#c4631c']);
      for (const [dx, dy] of [[-30, -4], [34, 8]]) c.topo += `<path d="M${x + dx} ${y + dy} q2 -10 0 -15" stroke="#7a5230" stroke-width="2" fill="none"/><path d="M${x + dx} ${y + dy - 15} q-9 -3 -11 4 q6 -4 11 -2 q-5 -8 -10 -8 q8 -3 10 5 q2 -9 10 -6 q-6 1 -8 7 q7 -3 11 3 q-6 -2 -13 -3 z" fill="#3f9a4c"/>`;
    },
    // vila na floresta
    Viridian(c, x, y) {
      c.base += `<ellipse cx="${x}" cy="${y + 4}" rx="30" ry="14" fill="#8dbb62"/>`;
      casa(c, x - 11, y + 1, 1.15, ['#b0553f', '#8b3f2d']); casa(c, x + 12, y - 4, 1, ['#8a6bb5', '#6b4f93']); casa(c, x + 6, y + 9, 0.85, ['#c98a35', '#a56d22']);
      arvore(c, x - 27, y + 6, 17, 'pinheiro'); arvore(c, x + 29, y + 4, 15, 'pinheiro');
    },
    // platô do campeonato: estádio, bandeiras e troféu
    Kanto(c, x, y) {
      sombraOval(c, 'alto', x, y + 9, 40, 11);
      c.base += poly([[x - 40, y + 10], [x - 30, y - 4], [x + 30, y - 4], [x + 40, y + 10]], '#b9a88a') + poly([[x + 12, y - 4], [x + 30, y - 4], [x + 40, y + 10], [x + 18, y + 10]], '#97876c');
      c.dir += `<polygon points="${pts([[x + 12, y - 4], [x + 30, y - 4], [x + 40, y + 10], [x + 18, y + 10]])}"/>`;
      c.esq += `<polygon points="${pts([[x - 40, y + 10], [x - 30, y - 4], [x - 12, y - 4], [x - 18, y + 10]])}"/>`;
      c.base += `<path d="M${x - 24} ${y - 14} v9 a24 8 0 0 0 48 0 v-9 z" fill="#e7e1f0"/><path d="M${x} ${y + 3} a24 8 0 0 0 24 -8 v-9 h-24 z" fill="#c4bcd6"/>`;
      c.dir += `<path d="M${x} ${y + 3} a24 8 0 0 0 24 -8 v-9 h-24 z"/>`;
      c.topo += `<ellipse cx="${x}" cy="${y - 14}" rx="24" ry="8" fill="#f8f5ff" stroke="#a79bc4"/><ellipse cx="${x}" cy="${y - 13}" rx="16" ry="4.6" fill="#5aa85a" stroke="#ffffff" stroke-width=".8"/>
        ${[-18, -9, 0, 9, 18].map(dx => `<rect x="${x + dx - 1.6}" y="${y - 8 + (Math.abs(dx) < 10 ? 2 : 0)}" width="3.2" height="7" rx="1.6" fill="#5b4f80"/>`).join('')}
        ${bandeira(x - 22, y - 15, '#e8504f', 0)}${bandeira(x + 22, y - 15, '#6390f0', -0.5)}${bandeira(x - 8, y - 20, '#f7d02c', -0.9)}${bandeira(x + 8, y - 20, '#7ac74c', -1.3)}
        <g class="wm-trofeu"><path d="M${x - 6} ${y - 40} h12 q0 10 -6 11 q-6 -1 -6 -11 z" fill="#ffd34d" stroke="#a9761a"/><path d="M${x - 6} ${y - 38} q-5 0 -3 4 q1 2 4 2 M${x + 6} ${y - 38} q5 0 3 4 q-1 2 -4 2" fill="none" stroke="#a9761a" stroke-width="1.2"/><rect x="${x - 1}" y="${y - 29}" width="2" height="4" fill="#a9761a"/><rect x="${x - 4}" y="${y - 26}" width="8" height="2.5" fill="#a9761a"/></g>`;
    },
  };
  function camadaCidades(nomes) {
    return nomes.slice().sort((a, b) => SPOTS[a][1] - SPOTS[b][1]).map(nome => {
      const c = novaCamada(), [x, y] = SPOTS[nome];
      MARCOS[nome](c, x, y);
      return `<g class="wm-marco" data-marco="${nome}">${montar(c)}</g>`;
    }).join('');
  }

  // ── camada 4: placas com nome (é o que se toca) ───────────────
  function camadaPlacas(o) {
    const placas = o.cities.map((city, i) => {
      const [x, y] = SPOTS[city.name], finale = !city.gym;
      const aberta = o.open.includes(i), vencida = o.badges.includes(i);
      const cor = finale ? '#ffd34d' : (o.types[city.gym] || {}).color || '#bbb';
      const largura = Math.max(46, city.name.length * 6.6 + 26), py = y + 17;
      const selo = vencida ? '★' : finale ? '♛' : String(i + 1);
      const cadeado = aberta ? '' : `<g transform="translate(${f(x + largura / 2 - 3)} ${py - 7})"><circle r="5.6" fill="#232838" stroke="#c9cee6" stroke-width=".8"/><rect x="-2.6" y="-.8" width="5.2" height="3.8" rx=".8" fill="#e9ecf7"/><path d="M-1.6 -.8 v-1.2 a1.6 1.6 0 0 1 3.2 0 v1.2" fill="none" stroke="#e9ecf7" stroke-width=".9"/></g>`;
      return `<g class="ws-city ${aberta ? 'wm-aberta' : 'ws-locked'}" data-city="${i}" role="button" tabindex="0" aria-label="${city.name}${aberta ? '' : ', em breve'}">
        <rect x="${f(x - largura / 2 - 8)}" y="${py - 34}" width="${f(largura + 16)}" height="48" fill="transparent"/>
        ${aberta && !vencida ? `<ellipse class="wm-farol" cx="${x}" cy="${y + 3}" rx="30" ry="12" fill="none" stroke="#fff6bf" stroke-width="2.4"/><g class="wm-seta"><path d="M${x} ${y - 38} l-7 -9 h4 v-8 h6 v8 h4 z" fill="#ffd34d" stroke="#5a3d00" stroke-width="1.2"/></g>` : ''}
        <rect x="${f(x - largura / 2)}" y="${py - 8}" width="${f(largura)}" height="16" rx="8" fill="#141a2c" stroke="${aberta ? '#ffd34d' : '#e9ecf7'}" stroke-width="${aberta ? 1.6 : 0.8}" opacity="${aberta ? 1 : 0.9}"/>
        <circle cx="${f(x - largura / 2 + 8)}" cy="${py}" r="6.4" fill="${cor}" stroke="#ffffff" stroke-width=".9"/>
        <text x="${f(x - largura / 2 + 8)}" y="${py + 2.8}" text-anchor="middle" class="wm-selo">${selo}</text>
        <text x="${f(x + 7)}" y="${py + 3.4}" text-anchor="middle" class="wm-nome">${city.name}</text>${cadeado}</g>`;
    }).join('');
    return `<g transform="translate(232 430)"><rect x="-22" y="-16" width="88" height="31" rx="7" fill="#fdf3d2" stroke="#8a6a35" stroke-width="2"/><text x="22" y="2" text-anchor="middle" class="wm-titulo">KANTO</text><text x="22" y="11" text-anchor="middle" class="wm-sub">${o.badges.length} de 8 insígnias</text></g>
      <g transform="translate(322 352)"><circle r="19" fill="#fdf3d2" stroke="#8a6a35" stroke-width="1.6" opacity=".95"/><path d="M0 -16 L4 0 L0 16 L-4 0 Z" fill="#c0473f"/><path d="M-16 0 L0 -4 L16 0 L0 4 Z" fill="#6b5330"/><path d="M0 -16 L4 0 L-4 0 Z" fill="#e8504f"/><circle r="2.4" fill="#fdf3d2"/><text y="-22" text-anchor="middle" class="wm-norte">N</text></g>
      ${placas}`;
  }

  // ── camada 5: céu ─────────────────────────────────────────────
  function camadaCeu() {
    const nuvem = (x, y, s, cls) => `<g class="${cls}"><g transform="translate(${x} ${y}) scale(${s})" fill="#ffffff"><ellipse cx="0" cy="0" rx="26" ry="10" opacity=".7"/><circle cx="-10" cy="-6" r="10" opacity=".75"/><circle cx="6" cy="-9" r="13" opacity=".75"/><circle cx="18" cy="-3" r="8" opacity=".7"/></g></g>`;
    const ave = (x, y, atraso) => `<g class="wm-ave" style="animation-delay:${atraso}s"><path class="wm-asa" d="M${x - 6} ${y} q3 -4 6 0 q3 -4 6 0" fill="none" stroke="#17202e" stroke-width="1.3" stroke-linecap="round"/></g>`;
    return nuvem(46, 164, 0.8, 'wm-deriva-1') + nuvem(150, 402, 0.8, 'wm-deriva-2') + nuvem(318, 46, 0.65, 'wm-deriva-3') + ave(-20, 130, 0) + ave(-40, 142, -0.6) + ave(-32, 118, -9);
  }

  const CSS = `
    .wm-caixa { position: relative; width: 100%; max-width: 430px; margin: 0 auto; aspect-ratio: ${W} / ${H}; border-radius: 18px; overflow: hidden; perspective: 900px; touch-action: pan-y; user-select: none; -webkit-user-select: none; background: #0d3f66; box-shadow: 0 14px 30px rgba(0,0,0,.55), inset 0 0 0 2px #ffffff22; }
    .wm-palco { position: absolute; inset: 0; transform-style: preserve-3d; }
    .wm-camada { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
    .wm-camada .ws-city { pointer-events: auto; cursor: pointer; outline: none; }
    .wm-camada .ws-city:focus-visible rect:nth-of-type(2), .wm-camada .ws-city:hover rect:nth-of-type(2) { fill: #2b3556; }
    .wm-nome { fill: #fff; font: 700 10px 'DM Sans', sans-serif; letter-spacing: .2px; }
    .wm-selo { fill: #10131f; font: 800 8px 'DM Sans', sans-serif; }
    .wm-rota { fill: #5a3d14; font: 800 7px 'DM Sans', sans-serif; }
    .wm-titulo { fill: #5a3d14; font: 800 15px 'Fraunces', serif; letter-spacing: 2px; }
    .wm-sub { fill: #7a5c2c; font: 700 6.5px 'DM Sans', sans-serif; }
    .wm-norte { fill: #fdf3d2; font: 800 8px 'DM Sans', sans-serif; paint-order: stroke; stroke: #17202e; stroke-width: 2px; }
    .wm-luz, .wm-tarde { position: absolute; inset: 0; pointer-events: none; }
    .wm-luz { mix-blend-mode: soft-light; }
    .wm-tarde { mix-blend-mode: multiply; background: linear-gradient(#ff9a4d, #7a4f9a); opacity: 0; }
    .wm-sol { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, #fffbe8 0 32%, #ffe27a 46%, #ffb52e88 60%, #ffb52e00 72%); filter: drop-shadow(0 0 14px #ffd75a); }
    .wm-sol::after { content: ''; position: absolute; inset: -16px; border-radius: 50%; background: repeating-conic-gradient(#fff2b055 0 7deg, #fff0 7deg 22deg); -webkit-mask: radial-gradient(circle, #0000 34%, #000 40%, #0000 70%); mask: radial-gradient(circle, #0000 34%, #000 40%, #0000 70%); animation: wm-gira 24s linear infinite; }
    .wm-botao { display: block; margin: 8px auto 0; padding: 6px 12px; border-radius: 999px; border: 1px solid #ffffff33; background: #181c2e; color: #f2f2f2; font: 700 12px 'DM Sans', sans-serif; cursor: pointer; }
    @keyframes wm-gira { to { transform: rotate(360deg); } }
    .wm-onda { animation: wm-onda 4s ease-in-out infinite; }
    @keyframes wm-onda { 0%, 100% { transform: translateX(-4px); opacity: .12; } 50% { transform: translateX(4px); opacity: .5; } }
    .wm-espuma { animation: wm-espuma 3.6s ease-in-out infinite; }
    @keyframes wm-espuma { 50% { opacity: .34; } }
    .wm-rio { stroke-dasharray: 22 3; animation: wm-rio 2.4s linear infinite; }
    @keyframes wm-rio { to { stroke-dashoffset: -50; } }
    .wm-boia { animation: wm-boia 3.4s ease-in-out infinite; }
    @keyframes wm-boia { 50% { transform: translateY(2.5px); } }
    .wm-bandeira { animation: wm-bandeira 1.5s ease-in-out infinite; }
    @keyframes wm-bandeira { 50% { transform: scaleX(.72) skewY(8deg); } }
    .wm-fumaca { animation: wm-fumaca 4.4s ease-out infinite; opacity: 0; transform-box: fill-box; transform-origin: center; }
    @keyframes wm-fumaca { 0% { opacity: 0; transform: translate(0, 4px) scale(.5); } 25% { opacity: .85; } 100% { opacity: 0; transform: translate(16px, -30px) scale(1.9); } }
    .wm-lava { animation: wm-lava 1.7s ease-in-out infinite; }
    @keyframes wm-lava { 50% { opacity: .45; } }
    .wm-pisca { animation: wm-lava 1.2s step-end infinite; }
    .wm-jato { animation: wm-lava 1s ease-in-out infinite; }
    .wm-facho { opacity: 0; animation: wm-facho 5s linear infinite; }
    @keyframes wm-facho { 0% { transform: rotate(-30deg) scaleX(1); } 50% { transform: rotate(10deg) scaleX(.4); } 100% { transform: rotate(-30deg) scaleX(1); } }
    .wm-trofeu { animation: wm-boia 2.2s ease-in-out infinite; }
    .wm-farol { animation: wm-farol 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
    @keyframes wm-farol { 0% { transform: scale(.65); opacity: 1; } 100% { transform: scale(1.35); opacity: 0; } }
    .wm-seta { animation: wm-seta 1s ease-in-out infinite; }
    @keyframes wm-seta { 50% { transform: translateY(-5px); } }
    .wm-deriva-1 { animation: wm-deriva 21s ease-in-out infinite alternate; }
    .wm-deriva-2 { animation: wm-deriva 27s ease-in-out -9s infinite alternate-reverse; }
    .wm-deriva-3 { animation: wm-deriva 17s ease-in-out -4s infinite alternate; }
    @keyframes wm-deriva { from { transform: translateX(-34px); } to { transform: translateX(38px); } }
    .wm-ave { animation: wm-voo 19s linear infinite; }
    @keyframes wm-voo { 0% { transform: translate(0, 0); } 100% { transform: translate(430px, -70px); } }
    .wm-asa { animation: wm-asa .55s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
    @keyframes wm-asa { 50% { transform: scaleY(-.5); } }
    @media (prefers-reduced-motion: reduce) { .wm-caixa *, .wm-sol::after { animation: none !important; } }
  `;
  let cssPronto = false;

  // profundidade de cada camada (px); a escala compensa a perspectiva para elas continuarem alinhadas em repouso
  const ALTURAS = { mar: -34, terra: 0, relevo: 12, cidades: 24, placas: 40, ceu: 78 };
  const SOMBRAS = { baixo: 3.5, medio: 7, alto: 11 };

  function render(alvo, opts) {
    const o = Object.assign({ cities: [], badges: [], open: [0], onCity: () => { }, types: {} }, opts);
    if (!cssPronto) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); cssPronto = true; }
    const nomes = o.cities.map(c => c.name);
    const desenhos = { mar: camadaMar(), terra: camadaTerra(nomes), relevo: camadaRelevo(), cidades: camadaCidades(nomes), placas: camadaPlacas(o), ceu: camadaCeu() };
    const parado = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const caixa = document.createElement('div');
    caixa.className = 'wm-caixa';
    caixa.innerHTML = `<div class="wm-palco">${Object.entries(desenhos).map(([nome, html]) => {
      const z = ALTURAS[nome], escala = (900 - z) / 900 * (nome === 'mar' ? 1.08 : 1);
      return `<svg class="wm-camada" data-camada="${nome}" viewBox="0 0 ${W} ${H}" style="transform:translateZ(${z}px) scale(${escala.toFixed(4)})" ${nome === 'placas' ? '' : 'aria-hidden="true"'}>${html}</svg>`;
    }).join('')}</div><div class="wm-tarde"></div><div class="wm-luz"></div><div class="wm-sol" aria-hidden="true"></div>`;
    alvo.appendChild(caixa);

    const palco = caixa.querySelector('.wm-palco'), sol = caixa.querySelector('.wm-sol');
    const luz = caixa.querySelector('.wm-luz'), tarde = caixa.querySelector('.wm-tarde');
    const sombras = [...caixa.querySelectorAll('.wm-sombra')], esq = [...caixa.querySelectorAll('.wm-esq')], dir = [...caixa.querySelectorAll('.wm-dir')];
    const janelas = [...caixa.querySelectorAll('.wm-janela')], fachos = [...caixa.querySelectorAll('.wm-facho')];
    const reflexo = caixa.querySelector('.wm-reflexo'), nuvens = caixa.querySelector('.wm-sombra-nuvem');

    // alvo do movimento: x de -1 (esquerda) a 1 (direita); y de 0 (sol alto) a 1 (sol baixo)
    const meta = { x: -0.45, y: 0.3 }, agora = { x: -0.45, y: 0.3 };
    let ultimoToque = -1e9, quadro = 0, vivo = true, ultimoDesenho = -1e9;
    const mirar = (x, y) => { meta.x = Math.max(-1, Math.min(1, x)); meta.y = Math.max(0, Math.min(1, y)); ultimoToque = performance.now(); };

    function aplicar() {
      const x = agora.x, baixo = agora.y;
      if (!parado) palco.style.transform = `rotateY(${(x * 8).toFixed(2)}deg) rotateX(${((0.45 - baixo) * 9).toFixed(2)}deg)`;
      const px = 50 + x * 40, py = 6 + baixo * 24;
      sol.style.left = `${px}%`; sol.style.top = `${py}%`;
      luz.style.background = `radial-gradient(circle at ${px}% ${py}%, rgba(255,246,200,.95), rgba(255,220,150,.25) 38%, rgba(15,25,60,.55) 100%)`;
      tarde.style.opacity = (Math.max(0, baixo - 0.45) * 0.8).toFixed(3);
      const comprimento = 0.55 + baixo * 1.1;
      for (const g of sombras) {
        const h = SOMBRAS[g.dataset.h] || 5;
        g.setAttribute('transform', `translate(${(-x * h * comprimento).toFixed(2)} ${(h * 0.28 * comprimento).toFixed(2)})`);
      }
      const escuroDir = Math.max(0, Math.min(0.55, 0.12 - x * 0.42)), escuroEsq = Math.max(0, Math.min(0.55, 0.12 + x * 0.42));
      for (const g of dir) g.setAttribute('opacity', escuroDir.toFixed(3));
      for (const g of esq) g.setAttribute('opacity', escuroEsq.toFixed(3));
      const acesas = Math.max(0, Math.min(1, (baixo - 0.55) * 3));
      for (const g of janelas) g.setAttribute('opacity', acesas.toFixed(3));
      for (const g of fachos) g.style.opacity = (acesas * 0.55).toFixed(2); // o farol acende com as janelas
      if (reflexo) { reflexo.setAttribute('cx', (180 + x * 140).toFixed(1)); reflexo.setAttribute('cy', (40 + baixo * 120).toFixed(1)); reflexo.setAttribute('opacity', (0.55 - baixo * 0.25).toFixed(2)); }
      if (nuvens) nuvens.setAttribute('transform', `translate(${(-x * 18).toFixed(1)} ${(8 + baixo * 10).toFixed(1)})`);
      caixa.dataset.sol = `${x.toFixed(2)},${baixo.toFixed(2)}`;
    }
    function passo(t) {
      if (!vivo) return;
      if (!caixa.isConnected) { destroy(); return; }
      if (t - ultimoDesenho < 30) { quadro = requestAnimationFrame(passo); return; } // ~30 por segundo poupa bateria
      ultimoDesenho = t;
      // sem toque há alguns segundos, o sol passeia sozinho pelo céu
      if (!parado && t - ultimoToque > 3500) { meta.x = Math.sin(t / 5200) * 0.85; meta.y = 0.42 - Math.cos(t / 5200) * Math.cos(t / 11000) * 0.38; }
      agora.x += (meta.x - agora.x) * 0.13; agora.y += (meta.y - agora.y) * 0.13;
      aplicar();
      quadro = requestAnimationFrame(passo);
    }

    const aoMover = e => { const r = caixa.getBoundingClientRect(); mirar((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height); };
    caixa.addEventListener('pointermove', aoMover);
    caixa.addEventListener('pointerdown', aoMover);

    // celular: inclinar o aparelho também move o sol (o iPhone pede permissão no toque do botão)
    let base = null;
    const aoInclinar = e => { if (e.gamma == null) return; if (base === null) base = e.beta; mirar(e.gamma / 28, 0.4 + (e.beta - base) / 50); };
    if (!parado && window.DeviceOrientationEvent && window.matchMedia('(pointer: coarse)').matches) {
      const botao = document.createElement('button');
      botao.type = 'button'; botao.className = 'wm-botao'; botao.textContent = '📱 Mover com o celular';
      botao.addEventListener('click', async () => {
        try {
          if (typeof DeviceOrientationEvent.requestPermission === 'function' && (await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
          base = null; window.addEventListener('deviceorientation', aoInclinar); botao.remove();
        } catch (err) { botao.remove(); }
      });
      alvo.appendChild(botao); // fora do desenho, para não cobrir cidade
    }

    caixa.querySelectorAll('.ws-city').forEach(g => {
      const abrir = () => o.onCity(Number(g.dataset.city));
      g.addEventListener('click', abrir);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    });

    function destroy() { vivo = false; cancelAnimationFrame(quadro); window.removeEventListener('deviceorientation', aoInclinar); }
    aplicar();
    quadro = requestAnimationFrame(passo);
    return { destroy, el: caixa, sun: (x, y) => { mirar(x, y); agora.x = meta.x; agora.y = meta.y; aplicar(); } };
  }

  window.wsMapa = { render, SPOTS };
})();
