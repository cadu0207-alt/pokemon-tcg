import Phaser from 'phaser';
import type { Mundo } from '../sim/mundo';
import { T } from './texturas';
import { pintarPedaco } from './terreno';
import { OBJETOS } from './assets';

const CH = 32; // tiles por lado de cada pedaço

interface Pedaco { chao: Phaser.GameObjects.Image; chave: string; objetos: Map<number, Phaser.GameObjects.Image>; }

/**
 * Desenha o mundo em pedaços de 32×32 tiles criados perto da câmera e descartados longe dela.
 * O chão é pintado pixel a pixel; os objetos (árvores, pedras, construções) são imagens com a base
 * no pé do tile e profundidade pela altura, para o personagem passar por trás deles.
 * `objetoEm` diz qual recorte de OBJETOS existe em cada posição, ou null.
 */
export class MapaEmPedacos {
  private pedacos = new Map<number, Pedaco>();
  private colunas: number; private linhas: number;

  constructor(private scene: Phaser.Scene, private mundo: Mundo, private objetoEm: (x: number, y: number) => string | null) {
    this.colunas = Math.ceil(mundo.largura / CH);
    this.linhas = Math.ceil(mundo.altura / CH);
  }

  get quantidade() { return this.pedacos.size; }

  private imagem(nome: string, x: number, y: number) {
    const [folha, , , , , escala = 1] = OBJETOS[nome];
    return this.scene.add.image((x + 0.5) * T, (y + 1) * T - 1, folha, nome)
      .setOrigin(0.5, 1).setScale(escala).setDepth((y + 1) * T - 2);
  }

  private criar(px: number, py: number): Pedaco {
    const m = this.mundo;
    const chave = `chao-${px}-${py}`;
    const tex = this.scene.textures.createCanvas(chave, CH * T, CH * T)!;
    tex.context.putImageData(pintarPedaco(m, px, py, CH), 0, 0);
    tex.refresh();
    const chao = this.scene.add.image(px * CH * T, py * CH * T, chave).setOrigin(0).setDepth(-2);
    const objetos = new Map<number, Phaser.GameObjects.Image>();
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
      const gx = px * CH + x, gy = py * CH + y;
      if (gx >= m.largura || gy >= m.altura) continue;
      const o = this.objetoEm(gx, gy);
      if (o) objetos.set(gy * m.largura + gx, this.imagem(o, gx, gy));
    }
    return { chao, chave, objetos };
  }

  /** Garante os pedaços em volta da câmera e descarta os distantes. */
  atualizar(vista: Phaser.Geom.Rectangle) {
    const tam = CH * T;
    const x0 = Math.max(0, Math.floor(vista.x / tam) - 1), x1 = Math.min(this.colunas - 1, Math.floor(vista.right / tam) + 1);
    const y0 = Math.max(0, Math.floor(vista.y / tam) - 1), y1 = Math.min(this.linhas - 1, Math.floor(vista.bottom / tam) + 1);
    let criados = 0;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const k = py * this.colunas + px;
      // 1 por quadro (~13 ms cada): a margem de 1 pedaço garante que fiquem prontos antes de aparecer
      if (!this.pedacos.has(k) && criados++ < (this.pedacos.size === 0 ? 9 : 1)) this.pedacos.set(k, this.criar(px, py));
    }
    for (const [k, p] of this.pedacos) {
      const px = k % this.colunas, py = Math.floor(k / this.colunas);
      if (px < x0 - 1 || px > x1 + 1 || py < y0 - 1 || py > y1 + 1) {
        for (const img of p.objetos.values()) img.destroy();
        p.chao.destroy(); this.scene.textures.remove(p.chave); this.pedacos.delete(k);
      }
    }
  }

  /** A terra mudou (expansão da ilha): recria na hora os pedaços carregados que tocam a área. */
  repintar(area: { x0: number; y0: number; x1: number; y1: number }) {
    for (const [k, p] of [...this.pedacos]) {
      const px = k % this.colunas, py = Math.floor(k / this.colunas);
      if ((px + 1) * CH <= area.x0 || px * CH > area.x1 || (py + 1) * CH <= area.y0 || py * CH > area.y1) continue;
      for (const img of p.objetos.values()) img.destroy();
      p.chao.destroy(); this.scene.textures.remove(p.chave);
      this.pedacos.set(k, this.criar(px, py));
    }
  }

  /** Atualiza o objeto de um tile (se o pedaço estiver carregado; senão ele lê o estado ao ser criado). */
  definirObjeto(x: number, y: number, nome: string | null) {
    const p = this.pedacos.get(Math.floor(y / CH) * this.colunas + Math.floor(x / CH));
    if (!p) return;
    const i = y * this.mundo.largura + x;
    p.objetos.get(i)?.destroy(); p.objetos.delete(i);
    if (nome) p.objetos.set(i, this.imagem(nome, x, y));
  }

  /** Imagem do objeto num tile (para efeitos como tremer ao levar golpe). */
  objeto(x: number, y: number) {
    return this.pedacos.get(Math.floor(y / CH) * this.colunas + Math.floor(x / CH))?.objetos.get(y * this.mundo.largura + x);
  }
}
