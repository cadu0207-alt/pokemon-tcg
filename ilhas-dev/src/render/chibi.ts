import Phaser from 'phaser';

/**
 * Gerador de personagens chibi em pixel art (24×24, 4 direções × 4 quadros).
 * Desenha partes simples numa grade e passa um contorno automático no fim:
 * qualquer pixel vazio encostado no desenho vira contorno. Isso deixa o traço limpo
 * e permite variar cabelo, roupa e penteado sem desenhar cada quadro à mão.
 */
export const LADO = 24;
export const QUADROS = 4;
export const DIRECOES = ['baixo', 'cima', 'esquerda', 'direita'] as const;
export type Penteado = 'curto' | 'longo' | 'rabo';

export interface Visual { pele: string; cabelo: string; roupa: string; calca: string; penteado: Penteado; }

const CONTORNO = '#3a2f45';

function escurecer(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}

class Grade {
  p: (string | null)[] = new Array(LADO * LADO).fill(null);
  set(x: number, y: number, c: string) { if (x >= 0 && y >= 0 && x < LADO && y < LADO) this.p[y * LADO + x] = c; }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= LADO || y >= LADO ? null : this.p[y * LADO + x]; }
  ret(x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  /** elipse cheia com centro (cx, cy) e raios rx, ry */
  oval(cx: number, cy: number, rx: number, ry: number, c: string, filtro?: (x: number, y: number) => boolean) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (!filtro || filtro(x, y))) this.set(x, y, c);
    }
  }
  contornar() {
    const novo = [...this.p];
    for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO; x++) {
      if (this.get(x, y)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const v = this.get(x + dx, y + dy); return v && v !== CONTORNO; })) novo[y * LADO + x] = CONTORNO;
    }
    this.p = novo;
  }
  pintar(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
    for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO; x++) {
      const c = this.get(x, y); if (!c) continue;
      ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function quadro(v: Visual, dir: (typeof DIRECOES)[number], q: number): Grade {
  const g = new Grade();
  const pele = v.pele, cab = v.cabelo, cabS = escurecer(v.cabelo, 0.75), cabL = escurecer(v.cabelo, 1.25);
  const roupa = v.roupa, roupaS = escurecer(v.roupa, 0.78), calca = v.calca;
  const bob = q === 1 || q === 3 ? 1 : 0;              // corpo sobe/desce ao andar
  const passo = q === 1 ? 1 : q === 3 ? -1 : 0;        // perna da frente
  const lado = dir === 'esquerda' || dir === 'direita';
  const espelho = dir === 'direita';
  const cx = 12;

  // pernas
  if (lado) {
    g.ret(cx - 2 + passo, 18 - bob, 2, 4 + bob, calca);
    g.ret(cx + 0 - passo, 18 - bob, 2, 4 + bob, escurecer(calca, 0.8));
  } else {
    g.ret(cx - 3, 18 - bob, 2, 4 + bob - (passo > 0 ? 1 : 0), calca);
    g.ret(cx + 1, 18 - bob, 2, 4 + bob - (passo < 0 ? 1 : 0), calca);
  }
  // tronco
  g.ret(cx - 4, 13 - bob, 8, 6, roupa);
  g.ret(cx - 4, 17 - bob, 8, 2, roupaS);
  if (!lado) { g.set(cx - 1, 14 - bob, roupaS); g.set(cx, 14 - bob, roupaS); } // gola
  // braços balançando
  if (lado) { g.ret(cx - 1 - passo, 14 - bob, 2, 3, roupaS); g.ret(cx - 1 - passo, 17 - bob, 2, 1, pele); }
  else { g.ret(cx - 5, 14 - bob + (passo > 0 ? 1 : 0), 1, 4, pele); g.ret(cx + 4, 14 - bob + (passo < 0 ? 1 : 0), 1, 4, pele); }

  // cabeça grande (chibi)
  const hy = 7 - bob;
  g.oval(cx, hy + 0.5, 6.5, 6, pele);
  // cabelo
  if (dir === 'cima') {
    g.oval(cx, hy, 6.8, 6.3, cab);
    g.oval(cx - 2, hy - 2, 2, 1.5, cabL);
  } else {
    g.oval(cx, hy - 1.5, 6.8, 4.6, cab, (_x, y) => y <= hy - 1);          // topo
    for (let x = cx - 6; x <= cx + 5; x += 2) g.set(x, hy - 1, cab);       // franja
    g.set(cx - 3, hy - 4, cabL); g.set(cx - 2, hy - 4, cabL);
    if (!lado) { g.ret(cx - 7, hy - 1, 1, 5, cab); g.ret(cx + 6, hy - 1, 1, 5, cab); }
    else g.ret(cx + 3, hy - 2, 3, 6, cab);                                  // nuca (lado esquerdo do desenho = frente)
  }
  if (v.penteado === 'longo') {
    if (dir === 'cima') g.ret(cx - 6, hy + 2, 12, 6, cab);
    else if (lado) g.ret(cx + 3, hy + 2, 3, 6, cabS);
    else { g.ret(cx - 7, hy + 3, 2, 6, cabS); g.ret(cx + 5, hy + 3, 2, 6, cabS); }
  } else if (v.penteado === 'rabo') {
    if (dir === 'cima') g.oval(cx, hy + 6, 1.8, 3, cabS);
    else if (lado) g.oval(cx + 7, hy + 2 + (bob ? 1 : 0), 1.6, 3, cabS);
    else { g.oval(cx - 8, hy + 1, 1.4, 2.4, cabS); g.oval(cx + 7.5, hy + 1, 1.4, 2.4, cabS); }
  }
  // rosto
  if (dir === 'baixo') {
    for (const ox of [-3, 2]) {
      g.ret(cx + ox, hy + 1, 2, 3, CONTORNO);
      g.set(cx + ox, hy + 1, '#ffffff');                   // brilho no olho
    }
    g.set(cx - 5, hy + 4, '#ff9fb4'); g.set(cx + 4, hy + 4, '#ff9fb4');   // bochechas
    g.set(cx, hy + 4, escurecer(pele, 0.7));
  } else if (lado) {
    g.ret(cx - 4, hy + 1, 2, 3, CONTORNO); g.set(cx - 4, hy + 1, '#ffffff');
    g.set(cx - 5, hy + 4, '#ff9fb4');
  }
  g.contornar();
  if (espelho) g.p = g.p.map((_, i) => g.p[Math.floor(i / LADO) * LADO + (LADO - 1 - (i % LADO))]);
  return g;
}

/** Gera a folha de sprites e as animações `${chave}-${direção}`. */
export function criarChibi(scene: Phaser.Scene, chave: string, v: Visual) {
  const c = document.createElement('canvas');
  c.width = LADO * QUADROS; c.height = LADO * DIRECOES.length;
  const ctx = c.getContext('2d')!;
  DIRECOES.forEach((d, l) => { for (let q = 0; q < QUADROS; q++) quadro(v, d, q).pintar(ctx, q * LADO, l * LADO); });
  const tex = scene.textures.addCanvas(chave, c)!;
  for (let l = 0; l < DIRECOES.length; l++) for (let q = 0; q < QUADROS; q++) tex.add(l * QUADROS + q, 0, q * LADO, l * LADO, LADO, LADO);
  DIRECOES.forEach((d, l) => scene.anims.create({
    key: `${chave}-${d}`, frameRate: 8, repeat: -1,
    frames: [0, 1, 2, 3].map(q => ({ key: chave, frame: l * QUADROS + q })),
  }));
}

export const quadroParado = (dir: string) => Math.max(0, DIRECOES.indexOf(dir as (typeof DIRECOES)[number])) * QUADROS;
