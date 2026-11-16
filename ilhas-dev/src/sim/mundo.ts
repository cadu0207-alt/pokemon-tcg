import { criarRng, criarRuido } from './rng';

export enum Tile { AguaFunda, Agua, Areia, Grama, Floresta, Rocha }

export const TILE_ANDAVEL: Record<Tile, boolean> = {
  [Tile.AguaFunda]: false, [Tile.Agua]: false, [Tile.Areia]: true,
  [Tile.Grama]: true, [Tile.Floresta]: true, [Tile.Rocha]: false,
};

export interface Ilha { id: number; cx: number; cy: number; raio: number; dono: number | null; }
export type TipoRecurso = 'arvore' | 'pedra' | 'arbusto' | 'minerio' | 'cristal';
export interface Recurso { id: number; tipo: TipoRecurso; x: number; y: number; }

export interface Mundo {
  seed: number; largura: number; altura: number;
  tiles: Uint8Array; ilhas: Ilha[]; recursos: Recurso[];
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
      raio: tamanhoCelula * (0.17 + rng() * 0.05),
    });
  }
  const neutras = Math.max(1, Math.floor(participantes / 3));
  for (let i = 0; i < neutras; i++) {
    ilhas.push({
      id: ilhas.length, dono: null,
      cx: rng() * largura, cy: rng() * altura,
      raio: tamanhoCelula * (0.2 + rng() * 0.15),
    });
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
  const MINIMO: Record<TipoRecurso, number> = { arvore: 8, pedra: 5, arbusto: 4, minerio: 2, cristal: 1 };
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

  return { seed, largura, altura, tiles, ilhas, recursos: livres };
}

/** Água navegável com jangada (rocha continua bloqueando). */
export const ehAgua = (t: Tile) => t === Tile.Agua || t === Tile.AguaFunda;

export function tileEm(m: Mundo, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= m.largura || y >= m.altura) return Tile.AguaFunda;
  return m.tiles[y * m.largura + x] as Tile;
}
