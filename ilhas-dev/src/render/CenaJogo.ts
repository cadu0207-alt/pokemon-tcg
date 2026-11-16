import Phaser from 'phaser';
import { gerarMundo, tileEm, TILE_ANDAVEL, type Mundo, type Recurso } from '../sim/mundo';
import { iniciarRecursos, golpear, atualizarRecursos, recursoAtivo, type EstadoRecursos } from '../sim/coleta';
import { novoInventario, type Inventario } from '../sim/inventario';
import { ITENS, type ItemId } from '../sim/itens';
import { criarPersonagem, criarTileset, T } from './texturas';
import { Interface } from './ui';

const VELOCIDADE = 5;          // tiles por segundo
const INTERVALO_GOLPE = 280;   // ms entre golpes
const RECURSO_TILE = { arvore: 6, pedra: 7, arbusto: 8 } as const;
const DIRS = ['baixo', 'cima', 'esquerda', 'direita'] as const;
type Dir = (typeof DIRS)[number];
const VETOR: Record<Dir, [number, number]> = { baixo: [0, 1], cima: [0, -1], esquerda: [-1, 0], direita: [1, 0] };

export class CenaJogo extends Phaser.Scene {
  private mundo!: Mundo;
  private recursos!: EstadoRecursos;
  private inv: Inventario = novoInventario();
  private ui!: Interface;
  private jogador!: Phaser.GameObjects.Sprite;
  private objetos!: Phaser.Tilemaps.TilemapLayer;
  private alvo!: Phaser.GameObjects.Rectangle;
  private teclas!: Record<string, Phaser.Input.Keyboard.Key>;
  private bloqueio = new Set<number>();
  private direcao: Dir = 'baixo';
  private ultimoGolpe = 0;
  private golpeando = false;

  constructor() { super('jogo'); }

  create() {
    const q = new URLSearchParams(location.search);
    this.mundo = gerarMundo({ seed: Number(q.get('seed')) || 2026, participantes: Number(q.get('n')) || 100 });
    this.recursos = iniciarRecursos(this.mundo);
    criarTileset(this);
    criarPersonagem(this, 'heroi');

    const m = this.mundo;
    const mapa = this.make.tilemap({ tileWidth: T, tileHeight: T, width: m.largura, height: m.altura });
    const tileset = mapa.addTilesetImage('tileset', 'tileset', T, T, 1, 2)!;
    const chao = mapa.createBlankLayer('chao', tileset)!;
    this.objetos = mapa.createBlankLayer('objetos', tileset)!;
    const dados: number[][] = [];
    for (let y = 0; y < m.altura; y++) dados.push(Array.from(m.tiles.subarray(y * m.largura, (y + 1) * m.largura)));
    chao.putTilesAt(dados, 0, 0);
    for (const r of m.recursos) this.mostrarRecurso(r);

    const casa = m.ilhas[0];
    this.jogador = this.add.sprite((Math.round(casa.cx) + 0.5) * T, (Math.round(casa.cy) + 0.5) * T, 'heroi', 0);
    this.jogador.setOrigin(0.5, 0.75).setDepth(10);
    this.alvo = this.add.rectangle(0, 0, T, T).setStrokeStyle(1, 0xffffff, 0.9).setOrigin(0).setDepth(5).setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, m.largura * T, m.altura * T);
    cam.setZoom(3).startFollow(this.jogador, true, 0.15, 0.15).setRoundPixels(true);
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.25, 6));
    });

    const kb = this.input.keyboard!;
    this.teclas = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.ui = new Interface(this.inv, () => this.ui.atualizar());
    kb.on('keydown-C', () => this.ui.alternarCraft());
    this.ui.atualizar();

    // Recursos renascem: checa a cada segundo.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.renascer() });
  }

  private idx(x: number, y: number) { return y * this.mundo.largura + x; }

  private mostrarRecurso(r: Recurso) {
    this.objetos.putTileAt(RECURSO_TILE[r.tipo], r.x, r.y);
    if (r.tipo !== 'arbusto') this.bloqueio.add(this.idx(r.x, r.y));
  }

  private renascer() {
    const agora = this.time.now;
    for (const r of atualizarRecursos(this.recursos, this.mundo, agora)) {
      const tx = Math.floor(this.jogador.x / T), ty = Math.floor(this.jogador.y / T);
      if (r.tipo !== 'arbusto' && Math.abs(tx - r.x) <= 1 && Math.abs(ty - r.y) <= 1) {
        this.recursos.renasce.set(r.id, agora + 5000); // não nasce em cima do jogador
        continue;
      }
      this.mostrarRecurso(r);
    }
  }

  private livre(px: number, py: number) {
    for (const [ox, oy] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) {
      const tx = Math.floor((px + ox) / T), ty = Math.floor((py + oy) / T);
      if (!TILE_ANDAVEL[tileEm(this.mundo, tx, ty)] || this.bloqueio.has(this.idx(tx, ty))) return false;
    }
    return true;
  }

  /** Recurso à frente do personagem; se não houver, o mais próximo encostado nele. */
  private recursoAlvo(): Recurso | null {
    const j = this.jogador;
    const tx = Math.floor(j.x / T), ty = Math.floor(j.y / T);
    const [dx, dy] = VETOR[this.direcao];
    const ativo = (x: number, y: number) => {
      const r = this.recursos.porTile.get(this.idx(x, y));
      return r && recursoAtivo(this.recursos, r) ? r : null;
    };
    const frente = ativo(tx + dx, ty + dy) ?? ativo(tx, ty);
    if (frente) return frente;
    let melhor: Recurso | null = null, dist = Infinity;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const r = ativo(tx + ox, ty + oy);
      if (!r) continue;
      const d = Math.hypot((r.x + 0.5) * T - j.x, (r.y + 0.5) * T - j.y);
      if (d < dist && d < T * 1.4) { dist = d; melhor = r; }
    }
    return melhor;
  }

  private golpe(r: Recurso) {
    const res = golpear(this.recursos, this.inv, r, this.time.now);
    if (!res) return;
    const cx = (r.x + 0.5) * T, cy = (r.y + 0.5) * T;
    // Personagem dá um "tranco" na direção do alvo.
    this.golpeando = true;
    const [dx, dy] = [Math.sign(cx - this.jogador.x), Math.sign(cy - this.jogador.y)];
    this.tweens.add({
      targets: this.jogador, x: this.jogador.x + dx * 2, y: this.jogador.y + dy * 2,
      duration: 70, yoyo: true, onComplete: () => (this.golpeando = false),
    });
    // Lascas saindo do recurso.
    const cor = r.tipo === 'pedra' ? 0xb9b4b0 : r.tipo === 'arvore' ? 0x8a5a3c : 0x6db35c;
    for (let i = 0; i < 4; i++) {
      const p = this.add.rectangle(cx, cy, 2, 2, cor).setDepth(11);
      this.tweens.add({
        targets: p, x: cx + Phaser.Math.Between(-10, 10), y: cy + Phaser.Math.Between(-12, 2),
        alpha: 0, duration: 350, onComplete: () => p.destroy(),
      });
    }
    if (res.ferramentaQuebrou && res.ferramenta) this.ui.aviso(`${ITENS[res.ferramenta].nome} quebrou!`);
    if (res.destruido) {
      this.objetos.removeTileAt(r.x, r.y);
      this.bloqueio.delete(this.idx(r.x, r.y));
      let i = 0;
      for (const [id, n] of Object.entries(res.ganhos)) this.textoFlutuante(cx, cy - 6 - i++ * 7, `+${n} ${ITENS[id as ItemId].nome}`);
    }
    this.ui.atualizar();
  }

  private textoFlutuante(x: number, y: number, txt: string) {
    const t = this.add.text(x, y, txt, {
      fontFamily: 'monospace', fontSize: '24px', color: '#fff', stroke: '#3a2f45', strokeThickness: 5,
    }).setOrigin(0.5).setScale(0.25).setDepth(20);
    this.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  update(t: number, dt: number) {
    const k = this.teclas;
    const j = this.jogador;
    let vx = 0, vy = 0;
    if (k.A.isDown || k.LEFT.isDown) vx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) vx += 1;
    if (k.W.isDown || k.UP.isDown) vy -= 1;
    if (k.S.isDown || k.DOWN.isDown) vy += 1;
    if ((vx || vy) && !this.golpeando) {
      const passo = (VELOCIDADE * T * dt) / 1000 / Math.hypot(vx, vy);
      const nx = j.x + vx * passo, ny = j.y + vy * passo;
      if (this.livre(nx, j.y)) j.x = nx;
      if (this.livre(j.x, ny)) j.y = ny;
      this.direcao = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'esquerda' : 'direita') : (vy < 0 ? 'cima' : 'baixo');
      j.anims.play(`heroi-${this.direcao}`, true);
    } else if (!this.golpeando) {
      j.anims.stop();
      j.setFrame(DIRS.indexOf(this.direcao) * 3);
    }

    const alvo = this.recursoAlvo();
    this.alvo.setVisible(!!alvo);
    if (alvo) this.alvo.setPosition(alvo.x * T, alvo.y * T);
    if (alvo && (k.SPACE.isDown || k.E.isDown) && t - this.ultimoGolpe >= INTERVALO_GOLPE) {
      this.ultimoGolpe = t;
      this.golpe(alvo);
    }
  }
}
