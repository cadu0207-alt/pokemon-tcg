import Phaser from 'phaser';
import { COR, desenhar } from './pixels';
import { criarRng } from '../sim/rng';

export const T = 16;

/** Tileset: 0..5 terrenos (ordem do enum Tile), 6..8 árvore/pedra/arbusto, 9..13 construções. */
export const N_TILES = 20;
export const TILE_RECURSO = { arvore: 6, pedra: 7, arbusto: 8, minerio: 14, cristal: 15 } as const;
export const TILE_CONSTRUCAO = { fogueira: 9, bancada: 10, bau: 11, casa: 12, cerca: 13, forja: 16, altar: 17, torre: 18, estatua: 19 } as const;
export function criarTileset(scene: Phaser.Scene) {
  const c = document.createElement('canvas');
  c.width = T * N_TILES; c.height = T;
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

  const madeira = { k: COR.contorno, t: COR.tronco, w: '#c08a62', p: COR.pedra, d: COR.pedraEsc };
  desenhar(ctx, [
    '................', '................', '.......r........', '......ror.......', '.....rooyr......', '....roooyor.....',
    '....royyyor.....', '....royyyyr.....', '.....ryyyr......', '...ktwtkwtkt....', '..pkttttttttkp..',
    '.pdp.tt..tt.pdp.', '..p..........p..', '................', '................', '................',
  ], { ...madeira, r: '#e0503c', o: '#ff9a3c', y: '#ffe07a' }, 9 * T, 0);
  desenhar(ctx, [
    '................', '................', '................', '.....p..........', '....pdp...kk....',
    'kkkkkkkkkkkkkkkk', 'kwwwwwwwwwwwwwwk', 'kttttttttttttttk', 'kkkkkkkkkkkkkkkk', '.kt.........tk..',
    '.kt.........tk..', '.kt.........tk..', '.kt.........tk..', '.kk.........kk..', '................', '................',
  ], madeira, 10 * T, 0);
  desenhar(ctx, [
    '................', '................', '................', '................', '..kkkkkkkkkkkk..',
    '.kwwwwwwwwwwwwk.', '.kwttttttttttwk.', '.kkkkkkyykkkkkk.', '.kttttkyyktttttk', '.kttttttttttttk.',
    '.kwttttttttttwk.', '.kttttttttttttk.', '.kkkkkkkkkkkkkk.', '................', '................', '................',
  ], { ...madeira, y: '#ffd166' }, 11 * T, 0);
  desenhar(ctx, [
    '.......kk.......', '......krrk......', '.....krRrrk.....', '....krrrRrrk....', '...krrRrrrrrk...',
    '..krrrrrrRrrrk..', '.kkkkkkkkkkkkkk.', '..kwwwwwwwwwwk..', '..kwkkwwwwkkwk..', '..kwkbwwwwkbwk..',
    '..kwkkwkkwkkwk..', '..kwwwwkdkwwwk..', '..kwwwwkdkwwwk..', '..kwwwwkdkwwwk..', '..kkkkkkkkkkkk..', '................',
  ], { k: COR.contorno, r: '#e07a8a', R: '#f2a3ae', w: '#f6efe0', b: COR.agua, d: COR.tronco }, 12 * T, 0);
  desenhar(ctx, [
    '................', '................', '................', '................', '..kk.......kk...',
    '..kt.......tk...', 'kkktkkkkkkkktkkk', 'wwwtwwwwwwwwtwww', 'kkktkkkkkkkktkkk', '..kt.......tk...',
    'kkktkkkkkkkktkkk', 'wwwtwwwwwwwwtwww', 'kkktkkkkkkkktkkk', '..kt.......tk...', '..kk.......kk...', '................',
  ], madeira, 13 * T, 0);

  const ped = { k: COR.contorno, p: COR.pedra, d: COR.pedraEsc, w: '#fff' };
  desenhar(ctx, [
    '................', '................', '................', '................', '................', '.....kkkkk......',
    '....kpopppk.....', '...kppppoppk....', '..kpoppppppdk...', '..kppppoppddk...', '.kppopppppdodk..',
    '.kpppppopdddk...', '..kkkkkkkkkkk...', '................', '................', '................',
  ], { ...ped, o: '#d9844a' }, 14 * T, 0);
  desenhar(ctx, [
    '................', '................', '.......k........', '......kck.......', '.....kcwck......', '..k..kcccck.....',
    '.kck.kccccck....', '.kcwkkccccck..k.', '.kccckcccck..kck', '..kcckccck..kcck', '...kkcccck..kck.',
    '..kpppppppppkk..', '.kpdppppppdppk..', '..kkkkkkkkkkk...', '................', '................',
  ], { ...ped, c: '#a98bff' }, 15 * T, 0);
  desenhar(ctx, [
    '................', '..........kk....', '..........kpk...', '...kkkkkkkkpk...', '..kppppppppppk..', '..kpdpppppppdk..',
    '..kppkkkkkkppk..', '..kpkoyyyyokpk..', '..kpkoyrryokpk..', '..kpkkkkkkkkpk..', '..kpppppppppdk..',
    '..kpdppppdpppk..', '..kkkkkkkkkkkk..', '................', '................', '................',
  ], { ...ped, o: '#ff9a3c', y: '#ffe07a', r: '#e0503c' }, 16 * T, 0);
  desenhar(ctx, [
    '................', '.......kk.......', '......kcck......', '.....kcwcck.....', '......kcck......', '.......kk.......',
    '....kkkkkkkk....', '...kppppppppk...', '...kpcppppcpk...', '...kppppppppk...', '..kkkkkkkkkkkk..',
    '..kpppppppppdk..', '.kppdpppppppdpk.', '.kkkkkkkkkkkkkk.', '................', '................',
  ], { ...ped, c: '#a98bff' }, 17 * T, 0);
  desenhar(ctx, [
    '...k.k.k.k.k....', '...kkkkkkkkk....', '...kpppppppk....', '....kppbppk.....', '....kpppppk.....', '....kpdpppk.....',
    '....kpppppk.....', '....kppbppk.....', '....kpppdpk.....', '....kpppppk.....', '...kppdppppk....',
    '...kpppppppk....', '..kpppkkkpppk...', '..kpppkdkpdpk...', '..kkkkkkkkkkk...', '................',
  ], { ...ped, b: '#3a2f45' }, 18 * T, 0);
  desenhar(ctx, [
    '......kkk.......', '.....kcwck......', '.....kccck......', '......kck.......', '....kkpppkk.....', '...kpppppppk....',
    '...kpkpppkpk....', '...kp.kpk.pk....', '.....kpppk......', '.....kp.pk......', '.....kp.pk......',
    '...kkkkkkkkk....', '..kpdpppppdpk...', '..kpppppppppk...', '..kkkkkkkkkkk...', '................',
  ], { ...ped, c: '#a98bff' }, 19 * T, 0);
  // Extrusão: cada tile ganha 1px de borda copiada, evitando linhas entre tiles com zoom fracionário.
  const e = document.createElement('canvas');
  e.width = N_TILES * (T + 2); e.height = T + 2;
  const ex = e.getContext('2d')!;
  for (let i = 0; i < N_TILES; i++) {
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

/** Texturas extras geradas em código: jangada, sombra e brilho da fogueira. */
export function criarCriaturas(scene: Phaser.Scene) {
  // Jangada sob o personagem quando ele está na água.
  const j = document.createElement('canvas'); j.width = 18; j.height = 8;
  desenhar(j.getContext('2d')!, [
    'kkkkkkkkkkkkkkkkkk', 'kttwttwttwttwttwtk', 'kttwttwttwttwttwtk', 'kkkkkkkkkkkkkkkkkk',
    '.e..............e.', 'e.e............e.e', '..................', '..................',
  ], { k: COR.contorno, t: COR.tronco, w: '#a8734f', e: '#d6f0ff' });
  scene.textures.addCanvas('jangada', j);
  // Sombra oval sob personagens e criaturas.
  const sb = document.createElement('canvas'); sb.width = 12; sb.height = 4;
  const sx = sb.getContext('2d')!; sx.fillStyle = '#1a1830';
  sx.beginPath(); sx.ellipse(6, 2, 6, 2, 0, 0, Math.PI * 2); sx.fill();
  scene.textures.addCanvas('sombra', sb);
  // Brilho da fogueira (gradiente radial) para a noite.
  const g = document.createElement('canvas'); g.width = g.height = 128;
  const gx = g.getContext('2d')!;
  const grad = gx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,200,120,0.9)'); grad.addColorStop(0.5, 'rgba(255,150,80,0.35)'); grad.addColorStop(1, 'rgba(255,120,60,0)');
  gx.fillStyle = grad; gx.fillRect(0, 0, 128, 128);
  scene.textures.addCanvas('brilho', g);
}
