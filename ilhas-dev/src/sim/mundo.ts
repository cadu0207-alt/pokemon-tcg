import { criarRng, criarRuido } from './rng';

export enum Tile { AguaFunda, Agua, Areia, Grama, Floresta, Rocha }

export const TILE_ANDAVEL: Record<Tile, boolean> = {
  [Tile.AguaFunda]: false, [Tile.Agua]: false, [Tile.Areia]: true,
  [Tile.Grama]: true, [Tile.Floresta]: true, [Tile.Rocha]: false,
};

/** `raio` é o raio atual (muda com a expansão); `raioMax` é o tamanho final da ilha. */
export interface Ilha { id: number; cx: number; cy: number; raio: number; raioMax: number; dono: number | null; }
export type TipoRecurso = 'arvore' | 'pedra' | 'arbusto' | 'minerio' | 'cristal';
export interface Recurso { id: number; tipo: TipoRecurso; x: number; y: number; }

export interface Mundo {
  seed: number; largura: number; altura: number;
  tiles: Uint8Array; ilhas: Ilha[]; recursos: Recurso[];
  /** Terreno completo (todas as ilhas no tamanho máximo). `tiles` é o terreno visível hoje. */
  tilesMax: Uint8Array;
}

export interface OpcoesMundo { seed: number; participantes: number; tamanhoCelula?: number; }

/**
 * Gera um arquipélago: uma ilha inicial por participante distribuída em grade
 * com deslocamento aleatório, mais ilhas neutras maiores entre elas.
 */
export function gerarMundo({ seed, participantes, tamanhoCelula = 48 }: OpcoesMundo): Mundo {
  const rng = criarRng(seed);
  const ruido = criarRuido(seed ^ 0x9e3779b9);
  const colunas = Math.ceil(Math.sqrt(participantes));
  const linhas = Math.ceil(participantes / colunas);
  const largura = colunas * tamanhoCelula, altura = linhas * tamanhoCelula;

  const ilhas: Ilha[] = [];
  for (let i = 0; i < participantes; i++) {
    const c = i % colunas, l = Math.floor(i / colunas);
    ilhas.push({
      id: i, dono: i,
      cx: (c + 0.3 + rng() * 0.4) * tamanhoCelula,
      cy: (l + 0.3 + rng() * 0.4) * tamanhoCelula,
      raio: tamanhoCelula * (0.17 + rng() * 0.05), raioMax: 0,
    });
  }
  const neutras = Math.max(1, Math.floor(participantes / 3));
  const iniciais = ilhas.slice();
  for (let i = 0; i < neutras; i++) {
    // Neutras nascem no mar entre as iniciais, sem encostar nelas (senão uma casa começaria com minério de graça).
    // Busca só nas iniciais da vizinhança (grade de células) para continuar rápido com 1000 participantes.
    let cx = 0, cy = 0, raio = 0;
    for (let t = 0; t < 40; t++) {
      cx = rng() * largura; cy = rng() * altura; raio = tamanhoCelula * (0.2 + rng() * 0.15);
      const c = Math.floor(cx / tamanhoCelula), l = Math.floor(cy / tamanhoCelula);
      let longe = true;
      for (let dl = -1; dl <= 1 && longe; dl++) for (let dc = -1; dc <= 1; dc++) {
        const vi = (l + dl) * colunas + (c + dc);
        if (c + dc < 0 || c + dc >= colunas || l + dl < 0 || vi >= iniciais.length) continue;
        const o = iniciais[vi];
        if (Math.hypot(o.cx - cx, o.cy - cy) < (o.raio + raio) * 1.25) { longe = false; break; }
      }
      if (longe) break;
    }
    ilhas.push({ id: ilhas.length, dono: null, cx, cy, raio, raioMax: 0 });
  }

  // Grade espacial: cada tile só consulta as ilhas das células vizinhas (antes: todas as ilhas, lento com 1000).
  const grade = new Map<number, Ilha[]>();
  const celulaDe = (x: number, y: number) => Math.floor(y / tamanhoCelula) * (colunas + 2) + Math.floor(x / tamanhoCelula);
  for (const ilha of ilhas) {
    const alcance = ilha.raio * 1.4 + 1; // h = 1 - d*1.15 só supera o piso (-0.6) para d < 1,39
    for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const k = celulaDe(Math.max(0, ilha.cx + ox * alcance), Math.max(0, ilha.cy + oy * alcance));
      const l = grade.get(k) ?? []; if (!l.includes(ilha)) l.push(ilha); grade.set(k, l);
    }
  }
  const tiles = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let h = -0.6;
      for (const ilha of grade.get(celulaDe(x, y)) ?? []) {
        const d = Math.hypot(x - ilha.cx, y - ilha.cy) / ilha.raio;
        h = Math.max(h, 1 - d * 1.15);
      }
      h += (ruido(x / 10, y / 10) - 0.5) * 0.45;
      let t: Tile;
      if (h < -0.35) t = Tile.AguaFunda;
      else if (h < 0.0) t = Tile.Agua;
      else if (h < 0.08) t = Tile.Areia;
      else if (h < 0.55) t = ruido(x / 6 + 100, y / 6) > 0.58 ? Tile.Floresta : Tile.Grama;
      else t = ruido(x / 5, y / 5 + 100) > 0.6 ? Tile.Rocha : Tile.Grama;
      tiles[y * largura + x] = t;
    }
  }

  // Garante uma área inicial andável no centro de cada ilha de participante.
  for (const ilha of ilhas) {
    if (ilha.dono === null) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = Math.round(ilha.cx) + dx, y = Math.round(ilha.cy) + dy;
      if (x >= 0 && y >= 0 && x < largura && y < altura) tiles[y * largura + x] = Tile.Grama;
    }
  }

  const recursos: Recurso[] = [];
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) {
    const t = tiles[y * largura + x] as Tile;
    const r = rng();
    let tipo: TipoRecurso | null = null;
    if (t === Tile.Floresta && r < 0.35) tipo = 'arvore';
    else if (t === Tile.Grama && r < 0.03) tipo = 'arvore';
    else if (t === Tile.Grama && r < 0.05) tipo = 'arbusto';
    else if (t === Tile.Grama && r < 0.065) tipo = 'pedra';
    if (tipo) recursos.push({ id: recursos.length, tipo, x, y });
  }
  // Garante o mínimo de cada recurso em toda ilha inicial (senão uma ilha sem pedra trava o progresso).
  // Ilhas iniciais: só o básico (minério e cristal só existem fora de casa — é preciso navegar).
  const MINIMO: Record<TipoRecurso, number> = { arvore: 8, pedra: 4, arbusto: 4, minerio: 0, cristal: 0 };
  const ocupado = new Set(recursos.map(r => r.y * largura + r.x));
  const porPosicao = new Map(recursos.map(r => [r.y * largura + r.x, r]));
  for (const ilha of ilhas) {
    if (ilha.dono === null) continue;
    const perto: Recurso[] = [];
    const R = Math.ceil(ilha.raio * 1.3);
    for (let y = Math.floor(ilha.cy) - R; y <= ilha.cy + R; y++) for (let x = Math.floor(ilha.cx) - R; x <= ilha.cx + R; x++) {
      const r = porPosicao.get(y * largura + x);
      const noNascimento = !!r && Math.abs(r.x - Math.round(ilha.cx)) <= 1 && Math.abs(r.y - Math.round(ilha.cy)) <= 1; // será removido logo abaixo
      if (r && !noNascimento && Math.hypot(r.x + 0.5 - ilha.cx, r.y + 0.5 - ilha.cy) < ilha.raio * 1.3) perto.push(r);
    }
    for (const tipo of Object.keys(MINIMO) as TipoRecurso[]) {
      let falta = MINIMO[tipo] - perto.filter(r => r.tipo === tipo).length;
      for (let tentativa = 0; falta > 0 && tentativa < 300; tentativa++) {
        const a = rng() * Math.PI * 2, d = 3 + rng() * (ilha.raio * 0.9 - 3);
        const x = Math.floor(ilha.cx + Math.cos(a) * d), y = Math.floor(ilha.cy + Math.sin(a) * d);
        const t = tiles[y * largura + x] as Tile;
        if ((t !== Tile.Grama && t !== Tile.Floresta && t !== Tile.Areia) || ocupado.has(y * largura + x)) continue;
        recursos.push({ id: recursos.length, tipo, x, y });
        ocupado.add(y * largura + x);
        falta--;
      }
    }
  }

  // Recursos não ficam em cima do ponto de nascimento.
  const livres = recursos.filter(r => !ilhas.some(i => i.dono !== null &&
    Math.abs(r.x - Math.round(i.cx)) <= 1 && Math.abs(r.y - Math.round(i.cy)) <= 1));
  livres.forEach((r, i) => (r.id = i));

  // Ilhas neutras são ricas em minério e cristal: o motivo para navegar.
  const ocupadoFinal = new Set(livres.map(r => r.y * largura + r.x));
  const rngNeutra = criarRng(seed ^ 0x51ed);
  for (const ilha of ilhas) {
    if (ilha.dono !== null) continue;
    const alvo = { minerio: 6 + Math.floor(rngNeutra() * 5), cristal: 3 + Math.floor(rngNeutra() * 3) };
    for (const tipo of ['minerio', 'cristal'] as const) {
      let falta = alvo[tipo];
      for (let t = 0; falta > 0 && t < 200; t++) {
        const a = rngNeutra() * Math.PI * 2, d = rngNeutra() * ilha.raio * 0.9;
        const x = Math.floor(ilha.cx + Math.cos(a) * d), y = Math.floor(ilha.cy + Math.sin(a) * d);
        if (x < 0 || y < 0 || x >= largura || y >= altura) continue;
        const tt = tiles[y * largura + x] as Tile;
        if ((tt !== Tile.Grama && tt !== Tile.Floresta && tt !== Tile.Areia) || ocupadoFinal.has(y * largura + x)) continue;
        livres.push({ id: livres.length, tipo, x, y }); ocupadoFinal.add(y * largura + x); falta--;
      }
    }
  }

  // Escassez em casa: garante um mínimo dentro da ilha minúscula do começo (nível 1).
  const MINIMO_INICIAL: [TipoRecurso, number][] = [['arvore', 3], ['pedra', 1], ['arbusto', 2]];
  const ocupadoIni = new Set(livres.map(r => r.y * largura + r.x));
  for (const ilha of ilhas) {
    if (ilha.dono === null) continue;
    const r0 = raioDoNivel(ilha.raio, 1) * TERRA;
    for (const [tipo, min] of MINIMO_INICIAL) {
      let falta = min - livres.filter(r => r.tipo === tipo && Math.hypot(r.x + 0.5 - ilha.cx, r.y + 0.5 - ilha.cy) < r0 - 0.8).length;
      for (let t = 0; falta > 0 && t < 200; t++) {
        const a = rng() * Math.PI * 2, d = 1.6 + rng() * (r0 - 2.6);
        const x = Math.floor(ilha.cx + Math.cos(a) * d), y = Math.floor(ilha.cy + Math.sin(a) * d);
        if (Math.abs(x - Math.round(ilha.cx)) <= 1 && Math.abs(y - Math.round(ilha.cy)) <= 1) continue;
        const tt = tiles[y * largura + x] as Tile;
        if ((tt !== Tile.Grama && tt !== Tile.Floresta && tt !== Tile.Areia) || ocupadoIni.has(y * largura + x)) continue;
        livres.push({ id: livres.length, tipo, x, y }); ocupadoIni.add(y * largura + x); falta--;
      }
    }
  }

  // Terreno completo guardado; ilhas dos participantes começam no nível 1 (pequenas).
  const tilesMax = tiles.slice();
  const mundo: Mundo = { seed, largura, altura, tiles, tilesMax, ilhas, recursos: livres };
  for (const ilha of ilhas) {
    ilha.raioMax = ilha.raio;
    if (ilha.dono !== null) aplicarExpansao(mundo, ilha, 1);
  }
  return mundo;
}

/** Água navegável com jangada (rocha continua bloqueando). */
export const ehAgua = (t: Tile) => t === Tile.Agua || t === Tile.AguaFunda;

// ---------- Expansão: a terra cresce com o nível da ilha ----------

export const NIVEL_MAX = 10;
/** Fração do raio em que ainda há terra (o resto é praia rasa no terreno original). */
const TERRA = 0.87;

/** Raio da ilha num nível de expansão: começa em ~42% e chega a 100% no nível 10. */
export const raioDoNivel = (raioMax: number, nivel: number) =>
  raioMax * (0.42 + (0.58 * (Math.min(NIVEL_MAX, Math.max(1, nivel)) - 1)) / (NIVEL_MAX - 1));

function ruidoCosta(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.12;
}

export interface Retangulo { x0: number; y0: number; x1: number; y1: number; }

/**
 * Recorta o terreno visível da ilha para o nível dado: dentro do raio fica o terreno original
 * (com uma faixa de praia na borda); fora dele, a terra vira água rasa. Retorna a área alterada.
 */
export function aplicarExpansao(m: Mundo, ilha: Ilha, nivel: number): Retangulo {
  const r = raioDoNivel(ilha.raioMax, nivel);
  ilha.raio = r;
  const R = Math.ceil(ilha.raioMax * 1.6);
  const area = { x0: Math.max(0, Math.floor(ilha.cx) - R), y0: Math.max(0, Math.floor(ilha.cy) - R),
    x1: Math.min(m.largura - 1, Math.floor(ilha.cx) + R), y1: Math.min(m.altura - 1, Math.floor(ilha.cy) + R) };
  // ilhas vizinhas que podem encostar nesta (a terra delas não pode ser recortada)
  const vizinhas = m.ilhas.filter(o => o !== ilha && Math.hypot(o.cx - ilha.cx, o.cy - ilha.cy) < (o.raioMax || o.raio) * 1.6 + ilha.raioMax * 1.6);
  for (let y = area.y0; y <= area.y1; y++) for (let x = area.x0; x <= area.x1; x++) {
    const i = y * m.largura + x;
    const orig = m.tilesMax[i] as Tile;
    if (orig <= Tile.Agua) { m.tiles[i] = orig; continue; }
    const d = Math.hypot(x + 0.5 - ilha.cx, y + 0.5 - ilha.cy);
    if (d > ilha.raioMax * 1.5) continue;
    // só mexe nos tiles que pertencem a esta ilha (a mais próxima, proporcional ao tamanho)
    if (vizinhas.some(o => Math.hypot(x + 0.5 - o.cx, y + 0.5 - o.cy) / (o.raioMax || o.raio) < d / ilha.raioMax)) continue;
    const limite = r * TERRA * (1 + ruidoCosta(x, y));
    if (d <= limite) m.tiles[i] = d > limite - 1.1 && orig !== Tile.Rocha ? Tile.Areia : orig;
    else m.tiles[i] = Tile.Agua;
  }
  return area;
}

export function tileEm(m: Mundo, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= m.largura || y >= m.altura) return Tile.AguaFunda;
  return m.tiles[y * m.largura + x] as Tile;
}
