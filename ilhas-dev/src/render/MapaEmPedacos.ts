import Phaser from 'phaser';
import type { Mundo } from '../sim/mundo';
import { T } from './texturas';

const CH = 32; // tiles por lado de cada pedaço

interface Pedaco { mapa: Phaser.Tilemaps.Tilemap; chao: Phaser.Tilemaps.TilemapLayer; objetos: Phaser.Tilemaps.TilemapLayer; }

/**
 * Desenha o mundo em pedaços de 32×32 tiles criados perto da câmera e descartados longe dela.
 * Com 1000 participantes o mapa tem 2,36 milhões de tiles: um único tilemap não cabe na memória do celular.
 * `objetoEm` diz qual tile de objeto (recurso ou construção) existe em cada posição, ou -1.
 */
export class MapaEmPedacos {
  private pedacos = new Map<number, Pedaco>();
  private colunas: number; private linhas: number;

  constructor(private scene: Phaser.Scene, private mundo: Mundo, private objetoEm: (x: number, y: number) => number) {
    this.colunas = Math.ceil(mundo.largura / CH);
    this.linhas = Math.ceil(mundo.altura / CH);
  }

  get quantidade() { return this.pedacos.size; }

  private criar(px: number, py: number): Pedaco {
    const m = this.mundo;
    const mapa = this.scene.make.tilemap({ tileWidth: T, tileHeight: T, width: CH, height: CH });
    const ts = mapa.addTilesetImage('tileset', 'tileset', T, T, 1, 2)!;
    const ox = px * CH * T, oy = py * CH * T;
    const chao = mapa.createBlankLayer('chao', ts, ox, oy)!;
    const objetos = mapa.createBlankLayer('objetos', ts, ox, oy)!;
    const dados: number[][] = [];
    for (let y = 0; y < CH; y++) {
      const linha: number[] = [];
      const gy = py * CH + y;
      for (let x = 0; x < CH; x++) {
        const gx = px * CH + x;
        linha.push(gx < m.largura && gy < m.altura ? m.tiles[gy * m.largura + gx] : 0);
        const o = gx < m.largura && gy < m.altura ? this.objetoEm(gx, gy) : -1;
        if (o >= 0) objetos.putTileAt(o, x, y);
      }
      dados.push(linha);
    }
    chao.putTilesAt(dados, 0, 0);
    chao.setDepth(-2); objetos.setDepth(-1);
    return { mapa, chao, objetos };
  }

  /** Garante os pedaços em volta da câmera e descarta os distantes. */
  atualizar(vista: Phaser.Geom.Rectangle) {
    const tam = CH * T;
    const x0 = Math.max(0, Math.floor(vista.x / tam) - 1), x1 = Math.min(this.colunas - 1, Math.floor(vista.right / tam) + 1);
    const y0 = Math.max(0, Math.floor(vista.y / tam) - 1), y1 = Math.min(this.linhas - 1, Math.floor(vista.bottom / tam) + 1);
    let criados = 0;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const k = py * this.colunas + px;
      if (!this.pedacos.has(k) && criados++ < 4) this.pedacos.set(k, this.criar(px, py)); // no máximo 4 por quadro
    }
    for (const [k, p] of this.pedacos) {
      const px = k % this.colunas, py = Math.floor(k / this.colunas);
      if (px < x0 - 1 || px > x1 + 1 || py < y0 - 1 || py > y1 + 1) { p.mapa.destroy(); this.pedacos.delete(k); }
    }
  }

  /** Atualiza o objeto de um tile (se o pedaço estiver carregado; senão ele lê o estado ao ser criado). */
  definirObjeto(x: number, y: number, indice: number) {
    const p = this.pedacos.get(Math.floor(y / CH) * this.colunas + Math.floor(x / CH));
    if (!p) return;
    if (indice >= 0) p.objetos.putTileAt(indice, x % CH, y % CH);
    else p.objetos.removeTileAt(x % CH, y % CH);
  }
}
