import Phaser from 'phaser';
import { atualizarBot, criarBots, pontuacao, type Bot, type MundoBots } from '../sim/bots';
import type { Construcao } from '../sim/construcao';
import type { Mundo, Recurso } from '../sim/mundo';
import type { Status } from '../sim/criaturas';
import { criarPersonagem, T } from './texturas';

const ROUPAS = ['#7aa7ff', '#ff9a8a', '#8fd27a', '#c39bff', '#ffd166', '#7fd6d6', '#f2a3ae', '#b0b8c8'];
const CABELOS = ['#ff8fb1', '#6b4a3a', '#f5d06f', '#3a3a5a', '#d9668e', '#e8e8f0', '#7aa7ff', '#a0522d'];
const DIRS = ['baixo', 'cima', 'esquerda', 'direita'] as const;

export interface SaveBot { x: number; y: number; inv: Bot['inv']; construcoes: Construcao[]; status: Status; habilidades?: string[]; }

/** Liga a simulação dos bots ao mundo desenhado: sprites, nomes e efeitos no mapa. */
export class BotsVisuais {
  bots: Bot[];
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private nomes: Phaser.GameObjects.Text[] = [];
  private sombras: Phaser.GameObjects.Image[] = [];

  constructor(
    private scene: Phaser.Scene, mundo: Mundo, quantidade: number, seed: number,
    private aoDestruir: (r: Recurso) => void, private aoConstruir: (c: Construcao) => void,
    save?: SaveBot[],
  ) {
    for (let i = 0; i < 8; i++) criarPersonagem(scene, `bot${i}`, ROUPAS[i], CABELOS[(i * 3) % 8]);
    this.bots = criarBots(mundo, quantidade, seed);
    this.bots.forEach((b, i) => {
      const s = save?.[i];
      if (s) { b.x = s.x; b.y = s.y; b.inv = s.inv; b.construcoes = s.construcoes; b.status = s.status; b.habilidades = s.habilidades ?? []; }
      this.sprites.push(scene.add.sprite(b.x * T, b.y * T, `bot${b.cor}`, 0).setOrigin(0.5, 0.75));
      this.sombras.push(scene.add.image(b.x * T, b.y * T, 'sombra').setAlpha(0.28));
      this.nomes.push(scene.add.text(b.x * T, b.y * T - 16, b.nome, {
        fontFamily: 'system-ui, sans-serif', fontSize: '28px', color: '#ffffff', stroke: '#3a2f45', strokeThickness: 6,
      }).setOrigin(0.5, 1).setScale(0.18).setDepth(29000));
    });
  }

  /** Construções que já existem (save) precisam aparecer no mapa ao carregar. */
  todasConstrucoes() { return this.bots.flatMap(b => b.construcoes); }

  atualizar(ctxBase: Omit<MundoBots, 'aoDestruir' | 'aoConstruir'>, dt: number) {
    const ctx: MundoBots = {
      ...ctxBase,
      aoDestruir: r => this.aoDestruir(r),
      aoConstruir: (_b, c) => this.aoConstruir(c),
    };
    const v = this.scene.cameras.main.worldView;
    const margem = 3 * T;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      atualizarBot(b, ctx, dt);
      const s = this.sprites[i], n = this.nomes[i];
      const px = b.x * T, py = b.y * T;
      const visivel = px > v.x - margem && px < v.right + margem && py > v.y - margem && py < v.bottom + margem;
      s.setVisible(visivel); n.setVisible(visivel); this.sombras[i].setVisible(visivel);
      if (!visivel) continue;
      s.setPosition(px, py).setDepth(py);
      this.sombras[i].setPosition(px, py + 2).setDepth(py - 1);
      n.setPosition(px, py - 13);
      const [dx, dy] = b.dir;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'esquerda' : 'direita') : (dy < 0 ? 'cima' : 'baixo');
      if (b.andando) s.anims.play(`bot${b.cor}-${dir}`, true);
      else { s.anims.stop(); s.setFrame(DIRS.indexOf(dir) * 3); }
    }
  }

  ranking(jogador: { construcoes: Construcao[]; status: Status }) {
    const linhas = this.bots.map(b => ({ nome: b.nome, perfil: b.perfil as string, pontos: pontuacao(b.construcoes, b.status), bot: b as Bot | null }));
    linhas.push({ nome: 'Você', perfil: 'jogador', pontos: pontuacao(jogador.construcoes, jogador.status), bot: null });
    return linhas.sort((a, b) => b.pontos - a.pontos || (a.bot ? 1 : 0) - (b.bot ? 1 : 0));
  }

  salvar(): SaveBot[] {
    return this.bots.map(b => ({ x: +b.x.toFixed(2), y: +b.y.toFixed(2), inv: b.inv, construcoes: b.construcoes, status: b.status, habilidades: b.habilidades }));
  }
}
