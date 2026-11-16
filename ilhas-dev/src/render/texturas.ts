import Phaser from 'phaser';
import { COR, desenhar } from './pixels';
import { criarRng } from '../sim/rng';

export const T = 16;

/** Tileset: 0..5 = terrenos (mesma ordem do enum Tile), 6..8 = árvore, pedra, arbusto. */
export function criarTileset(scene: Phaser.Scene) {
  const c = document.createElement('canvas');
  c.width = T * 9; c.height = T;
  const ctx = c.getContext('2d')!;
  const rng = criarRng(3);
  const base = (i: number, cor: string, detalhes: [string, number][]) => {
    ctx.fillStyle = cor; ctx.fillRect(i * T, 0, T, T);
    for (const [cd, dens] of detalhes)
      for (let n = 0; n < dens; n++) {
        ctx.fillStyle = cd;
        ctx.fillRect(i * T + Math.floor(rng() * T), Math.floor(rng() * T), 1, 1);
      }
  };
  base(0, COR.aguaFunda, [[COR.agua, 6]]);
  base(1, COR.agua, [[COR.espuma, 5]]);
  base(2, COR.areia, [[COR.areiaEsc, 10]]);
  base(3, COR.grama, [[COR.gramaEsc, 12], [COR.gramaClara, 6]]);
  base(4, COR.floresta, [[COR.florestaEsc, 16], [COR.grama, 4]]);
  base(5, COR.rocha, [[COR.rochaEsc, 18]]);

  const arvore = [
    '................', '.....kkkkkk.....', '...kkccccccck...', '..kcclllcccccck.',
    '..kcllccccccck..', '.kccccccclccccck', '.kcccclccccccck.', '.kccccccccccck..',
    '..kcccccccccck..', '...kkcccccckk...', '.....kkttkk.....', '......kttk......',
    '......kttk......', '.....kttttk.....', '......kkkk......', '................',
  ];
  desenhar(ctx, arvore, { k: COR.contorno, c: COR.copa, l: COR.copaClara, t: COR.tronco }, 6 * T, 0);
  const pedra = [
    '................', '................', '................', '................',
    '................', '................', '.....kkkkk......', '....kpppppk.....',
    '...kpwppppdk....', '..kpppppppddk...', '..kppppppdddk...', '.kpppppppddddk..',
    '.kppppppdddddk..', '..kkkkkkkkkkk...', '................', '................',
  ];
  desenhar(ctx, pedra, { k: COR.contorno, p: COR.pedra, d: COR.pedraEsc, w: COR.branco }, 7 * T, 0);
  const arbusto = [
    '................', '................', '................', '................',
    '................', '................', '................', '.....kkkkk......',
    '...kkcclcck.....', '..kcbcccccbkk...', '..kcccclccccck..', '.kccbccccbccck..',
    '.kcccccccccck...', '..kkkkkkkkkk....', '................', '................',
  ];
  desenhar(ctx, arbusto, { k: COR.contorno, c: COR.gramaEsc, l: COR.gramaClara, b: COR.baga }, 8 * T, 0);
  // Extrusão: cada tile ganha 1px de borda copiada, evitando linhas entre tiles com zoom fracionário.
  const e = document.createElement('canvas');
  e.width = 9 * (T + 2); e.height = T + 2;
  const ex = e.getContext('2d')!;
  for (let i = 0; i < 9; i++) {
    const dx = i * (T + 2);
    ex.drawImage(c, i * T, 0, T, T, dx + 1, 1, T, T);
    ex.drawImage(c, i * T, 0, 1, T, dx, 1, 1, T);            // borda esquerda
    ex.drawImage(c, i * T + T - 1, 0, 1, T, dx + T + 1, 1, 1, T); // borda direita
    ex.clearRect(dx, 0, T + 2, 1); ex.clearRect(dx, T + 1, T + 2, 1);
    ex.drawImage(c, i * T, 0, T, 1, dx + 1, 0, T, 1);        // borda de cima
    ex.drawImage(c, i * T, T - 1, T, 1, dx + 1, T + 1, T, 1);// borda de baixo
  }
  scene.textures.addCanvas('tileset', e);
}

/** Personagem chibi: 4 direções (baixo, cima, esquerda, direita) × 3 quadros. */
export function criarPersonagem(scene: Phaser.Scene, chave: string, roupa = COR.roupa, cabelo = COR.cabelo) {
  const c = document.createElement('canvas');
  c.width = T * 3; c.height = T * 4;
  const ctx = c.getContext('2d')!;
  const pal = {
    k: COR.contorno, h: cabelo, H: COR.cabeloEsc, s: COR.pele, o: COR.olho,
    w: COR.branco, r: roupa, R: COR.roupaEsc, b: '#ffb3c6',
  };
  const cabeca = {
    baixo: ['....kkkkkk......', '...khhhhhhk.....', '..khhhhhhhhk....', '..khHsssssHk....',
            '..khsowsowshk...', '..kssosssossk...', '...ksbsssbsk....', '....kssssk......'],
    cima:  ['....kkkkkk......', '...khhhhhhk.....', '..khhhhhhhhk....', '..khhhhhhhhk....',
            '..khhHhhHhhk....', '..khhhhhhhhk....', '...khhhhhhk.....', '....kssssk......'],
    lado:  ['....kkkkkk......', '...khhhhhhk.....', '..khhhhhhhhk....', '..khhhHsssk.....',
            '..khhhsssowk....', '..khhssssosk....', '...khssssbk.....', '....kssssk......'],
  };
  const corpo = [
    ['...krrrrrrk.....', '..ksrrrrrrsk....', '...krRrrRrk.....', '...kRRkkRRk.....',
     '...kk....kk.....', '................', '................', '................'],
    ['...krrrrrrk.....', '..ksrrrrrrsk....', '...krRrrRrk.....', '...kRRkkRk......',
     '...kk...kk......', '................', '................', '................'],
    ['...krrrrrrk.....', '..ksrrrrrrsk....', '...krRrrRrk.....', '....kRkkRRk.....',
     '.....kk..kk.....', '................', '................', '................'],
  ];
  const dirs: (keyof typeof cabeca)[] = ['baixo', 'cima', 'lado', 'lado'];
  dirs.forEach((d, linha) => {
    for (let q = 0; q < 3; q++) {
      const ox = q * T, oy = linha * T;
      if (linha === 3) {
        // direita = espelho da esquerda
        ctx.save(); ctx.translate(ox + T, oy); ctx.scale(-1, 1);
        desenhar(ctx, cabeca[d], pal, 0, 1); desenhar(ctx, corpo[q], pal, 0, 9);
        ctx.restore();
      } else {
        desenhar(ctx, cabeca[d], pal, ox, oy + 1);
        desenhar(ctx, corpo[q], pal, ox, oy + 9);
      }
    }
  });
  const tex = scene.textures.addCanvas(chave, c)!;
  for (let l = 0; l < 4; l++) for (let q = 0; q < 3; q++) tex.add(l * 3 + q, 0, q * T, l * T, T, T);
  const nomes = ['baixo', 'cima', 'esquerda', 'direita'];
  nomes.forEach((n, l) => {
    scene.anims.create({
      key: `${chave}-${n}`, frameRate: 8, repeat: -1,
      frames: [1, 0, 2, 0].map(q => ({ key: chave, frame: l * 3 + q })),
    });
  });
}
