import Phaser from 'phaser';
import { gerarMundo, tileEm, TILE_ANDAVEL, type Mundo } from '../sim/mundo';
import { criarPersonagem, criarTileset, T } from './texturas';

const VELOCIDADE = 5; // tiles por segundo
const RECURSO_TILE = { arvore: 6, pedra: 7, arbusto: 8 } as const;

export class CenaJogo extends Phaser.Scene {
  private mundo!: Mundo;
  private jogador!: Phaser.GameObjects.Sprite;
  private teclas!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private bloqueio = new Set<number>();
  private direcao = 'baixo';

  constructor() { super('jogo'); }

  create() {
    const seed = Number(new URLSearchParams(location.search).get('seed')) || 2026;
    const participantes = Number(new URLSearchParams(location.search).get('n')) || 100;
    this.mundo = gerarMundo({ seed, participantes });
    criarTileset(this);
    criarPersonagem(this, 'heroi');

    const m = this.mundo;
    const mapa = this.make.tilemap({ tileWidth: T, tileHeight: T, width: m.largura, height: m.altura });
    const tileset = mapa.addTilesetImage('tileset', 'tileset', T, T, 1, 2)!;
    const chao = mapa.createBlankLayer('chao', tileset)!;
    const objetos = mapa.createBlankLayer('objetos', tileset)!;
    const dados: number[][] = [];
    for (let y = 0; y < m.altura; y++) {
      const linha: number[] = [];
      for (let x = 0; x < m.largura; x++) linha.push(m.tiles[y * m.largura + x]);
      dados.push(linha);
    }
    chao.putTilesAt(dados, 0, 0);
    for (const r of m.recursos) {
      objetos.putTileAt(RECURSO_TILE[r.tipo], r.x, r.y);
      if (r.tipo !== 'arbusto') this.bloqueio.add(r.y * m.largura + r.x);
    }

    const casa = m.ilhas[0];
    this.jogador = this.add.sprite((Math.round(casa.cx) + 0.5) * T, (Math.round(casa.cy) + 0.5) * T, 'heroi', 0);
    this.jogador.setOrigin(0.5, 0.75).setDepth(10);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, m.largura * T, m.altura * T);
    cam.setZoom(3).startFollow(this.jogador, true, 0.15, 0.15).setRoundPixels(true);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.25, 6));
    });

    const kb = this.input.keyboard!;
    this.teclas = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.hud = this.add.text(8, 8, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#fff',
      backgroundColor: '#0008', padding: { x: 6, y: 4 },
    }).setScrollFactor(0).setDepth(100);
    // Câmera separada para a interface, sem zoom.
    cam.ignore(this.hud);
    const ui = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    ui.ignore([chao, objetos, this.jogador]);
    this.scale.on('resize', (s: Phaser.Structs.Size) => ui.setSize(s.width, s.height));
  }

  private livre(px: number, py: number) {
    // Caixa de colisão pequena nos pés do personagem.
    const m = this.mundo;
    for (const [ox, oy] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) {
      const tx = Math.floor((px + ox) / T), ty = Math.floor((py + oy) / T);
      if (!TILE_ANDAVEL[tileEm(m, tx, ty)] || this.bloqueio.has(ty * m.largura + tx)) return false;
    }
    return true;
  }

  update(_t: number, dt: number) {
    const k = this.teclas;
    let vx = 0, vy = 0;
    if (k.A.isDown || k.LEFT.isDown) vx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) vx += 1;
    if (k.W.isDown || k.UP.isDown) vy -= 1;
    if (k.S.isDown || k.DOWN.isDown) vy += 1;
    const j = this.jogador;
    if (vx || vy) {
      const len = Math.hypot(vx, vy);
      const passo = (VELOCIDADE * T * dt) / 1000 / len;
      const nx = j.x + vx * passo, ny = j.y + vy * passo;
      if (this.livre(nx, j.y)) j.x = nx;
      if (this.livre(j.x, ny)) j.y = ny;
      this.direcao = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'esquerda' : 'direita') : (vy < 0 ? 'cima' : 'baixo');
      j.anims.play(`heroi-${this.direcao}`, true);
    } else {
      j.anims.stop();
      j.setFrame(['baixo', 'cima', 'esquerda', 'direita'].indexOf(this.direcao) * 3);
    }
    const cam = this.cameras.main;
    const tx = Math.floor(j.x / T), ty = Math.floor(j.y / T);
    this.hud.setText(
      `Ilhas — protótipo\nposição ${tx},${ty}   zoom ${cam.zoom.toFixed(2)}\n` +
      `${this.mundo.ilhas.length} ilhas · ${this.mundo.recursos.length} recursos\nWASD/setas: andar · roda: zoom`,
    );
  }
}
