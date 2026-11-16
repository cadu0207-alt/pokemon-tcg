import Phaser from 'phaser';
import type { ItemId } from '../sim/itens';

/**
 * Arte do Ninja Adventure Asset Pack (Pixel-boy e AAA, licença CC0) — ver public/ninja/CREDITOS.md.
 * Personagens e monstros: folhas 16×16 em que as colunas são as direções (baixo, cima, esquerda, direita)
 * e as linhas são os quadros da animação.
 */
export const BASE = 'ninja/';

export const PERSONAGENS = ['Boy', 'Princess', 'Cavegirl', 'Caveman', 'EggBoy', 'EggGirl', 'Eskimo', 'Hunter', 'Knight', 'LionBoy',
  'Monk', 'NinjaBlue', 'NinjaGreen', 'NinjaRed', 'NinjaYellow', 'Noble', 'OldMan', 'Samurai', 'Shaman', 'Inspector',
  'Monkey', 'MaskFrog', 'Cavegirl2', 'Monk2'] as const;
export type Personagem = (typeof PERSONAGENS)[number];

export const DIRECOES = ['baixo', 'cima', 'esquerda', 'direita'] as const;
export const quadroParado = (dir: string) => Math.max(0, DIRECOES.indexOf(dir as (typeof DIRECOES)[number]));

/** Criaturas do jogo → arquivo e formato da folha. */
export const CRIATURA_ARTE: Record<string, { arquivo: string; tipo: 'direcional' | 'lado'; w: number; h: number; quadros: number }> = {
  coelho: { arquivo: 'criaturas/guaxinim.png', tipo: 'direcional', w: 16, h: 16, quadros: 4 },
  slime: { arquivo: 'criaturas/slime.png', tipo: 'direcional', w: 16, h: 16, quadros: 4 },
  lobo: { arquivo: 'criaturas/fera.png', tipo: 'direcional', w: 16, h: 16, quadros: 4 },
  javali: { arquivo: 'criaturas/javali.png', tipo: 'lado', w: 17, h: 16, quadros: 2 },
};

/** Recortes dos objetos do mapa: [folha, x, y, w, h, escala]. Desenhados com a base no pé do tile. */
export const OBJETOS: Record<string, [string, number, number, number, number, number?]> = {
  arvore0: ['natureza', 0, 0, 32, 32], arvore1: ['natureza', 32, 0, 32, 32], arvore2: ['natureza', 256, 0, 32, 32], arvore3: ['natureza', 224, 0, 32, 32],
  pedra: ['natureza', 256, 128, 32, 32, 0.75],
  nucleo: ['natureza', 32, 224, 16, 16, 1.6], arbusto: ['natureza', 16, 160, 16, 16],
  minerio: ['natureza', 112, 224, 32, 32, 0.75], cristal: ['natureza', 112, 256, 32, 32, 0.75],
  fogueira: ['acampamento', 192, 80, 32, 32, 0.75], bau: ['acampamento', 64, 128, 16, 16], bancada: ['acampamento', 128, 48, 32, 32, 0.75],
  casa: ['casas', 0, 0, 64, 48, 0.6], forja: ['casas', 464, 176, 32, 32, 0.8], altar: ['casas', 48, 240, 32, 32, 0.8],
  torre: ['casas', 4, 80, 40, 32, 0.8], estatua: ['casas', 16, 240, 32, 48, 0.75], cerca: ['casas', 160, 80, 16, 16],
};

/** Escolhe a variante da árvore pela posição (sempre a mesma para o mesmo tile). */
export const varianteArvore = (x: number, y: number) => `arvore${((x * 73856093) ^ (y * 19349663)) >>> 0 & 3}`;

/** Ícones de itens que existem no pacote (os demais continuam desenhados no código). */
export const ICONES_PNG: Partial<Record<ItemId, string>> = Object.fromEntries(
  (['madeira', 'pedra', 'fibra', 'baga', 'machado_pedra', 'picareta_pedra', 'foice_pedra', 'carne', 'carne_assada', 'espada_pedra',
    'lanca_madeira', 'cristal', 'lingote', 'couro', 'machado_ferro', 'picareta_ferro', 'espada_ferro', 'pocao_mana'] as ItemId[])
    .map(id => [id, `${BASE}itens/${id}.png`]),
);

export function carregar(scene: Phaser.Scene) {
  scene.load.setPath(BASE);
  for (const p of PERSONAGENS) scene.load.spritesheet(`p-${p}`, `chars/${p}.png`, { frameWidth: 16, frameHeight: 16 });
  for (const [tipo, a] of Object.entries(CRIATURA_ARTE)) scene.load.spritesheet(`cri-${tipo}`, a.arquivo, { frameWidth: a.w, frameHeight: a.h });
  for (const f of ['natureza', 'elementos', 'casas', 'acampamento']) scene.load.image(f, `cenario/${f}.png`);
  scene.load.setPath('');
}

/** Cria os recortes dos objetos e as animações. Chamar no create(). */
export function preparar(scene: Phaser.Scene) {
  for (const [nome, [folha, x, y, w, h]] of Object.entries(OBJETOS)) scene.textures.get(folha).add(nome, 0, x, y, w, h);
  for (const p of PERSONAGENS) DIRECOES.forEach((d, col) => scene.anims.create({
    key: `p-${p}-${d}`, frameRate: 8, repeat: -1,
    frames: [0, 1, 2, 3].map(l => ({ key: `p-${p}`, frame: l * 4 + col })),
  }));
  for (const [tipo, a] of Object.entries(CRIATURA_ARTE)) {
    if (a.tipo === 'lado') scene.anims.create({ key: `cri-${tipo}`, frameRate: 5, repeat: -1, frames: scene.anims.generateFrameNumbers(`cri-${tipo}`, { start: 0, end: a.quadros - 1 }) });
    else DIRECOES.forEach((d, col) => scene.anims.create({
      key: `cri-${tipo}-${d}`, frameRate: 6, repeat: -1,
      frames: [0, 1, 2, 3].map(l => ({ key: `cri-${tipo}`, frame: l * 4 + col })),
    }));
  }
}

/** Recorte de um objeto como imagem (para ícones de construções na interface). */
export function recorteComoUrl(scene: Phaser.Scene, nome: string): string | null {
  const o = OBJETOS[nome]; if (!o) return null;
  const [folha, x, y, w, h] = o;
  const src = scene.textures.get(folha).getSourceImage() as HTMLImageElement;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c.toDataURL();
}
