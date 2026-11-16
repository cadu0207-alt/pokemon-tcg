import Phaser from 'phaser';
import {
  CRIATURAS, atualizarCriatura, ferirCriatura, novaCriatura, type Criatura, type TipoCriatura,
} from '../sim/criaturas';
import { naIlha } from '../sim/construcao';
import type { Ilha } from '../sim/mundo';
import { criarRng } from '../sim/rng';
import { T } from './texturas';

export interface Bicho { c: Criatura; s: Phaser.GameObjects.Sprite; barra: Phaser.GameObjects.Graphics; }

const SORTEIO_DIA: [TipoCriatura, number][] = [['coelho', 0.45], ['javali', 0.25], ['slime', 0.3]];
const SORTEIO_NOITE: [TipoCriatura, number][] = [['slime', 0.45], ['lobo', 0.4], ['coelho', 0.15]];
const RAIO_FOGO = 7; // hostis não nascem perto de fogueira

/** Gerencia nascimento, IA, desenho e remoção das criaturas perto do jogador. */
export class Fauna {
  lista: Bicho[] = [];
  private proximoId = 0;
  private rng: () => number;

  constructor(
    private scene: Phaser.Scene,
    private andavel: (tx: number, ty: number) => boolean,
    private casa: Ilha,
    private fogueiras: () => { x: number; y: number }[],
    seed: number,
  ) { this.rng = criarRng(seed ^ 0xfa); }

  private sortear(tabela: [TipoCriatura, number][]): TipoCriatura {
    let r = this.rng();
    for (const [t, p] of tabela) { if ((r -= p) <= 0) return t; }
    return tabela[0][0];
  }

  private pertoDoFogo(x: number, y: number, raio = RAIO_FOGO) {
    return this.fogueiras().some(f => Math.hypot(f.x + 0.5 - x, f.y + 0.5 - y) < raio);
  }

  /** Tenta fazer nascer uma criatura fora da tela, perto o bastante para aparecer logo. */
  tentarNascer(jx: number, jy: number, noite: boolean) {
    const max = noite ? 16 : 10;
    if (this.lista.length >= max) return;
    // Várias tentativas: perto de ilhas pequenas quase todo ponto é água.
    let x = 0, y = 0, achou = false;
    for (let i = 0; i < 12 && !achou; i++) {
      const a = this.rng() * Math.PI * 2, d = 7 + this.rng() * 9;
      x = Math.floor(jx + Math.cos(a) * d) + 0.5; y = Math.floor(jy + Math.sin(a) * d) + 0.5;
      achou = this.andavel(Math.floor(x), Math.floor(y));
    }
    if (!achou) return;
    let tipo = this.sortear(noite ? SORTEIO_NOITE : SORTEIO_DIA);
    const def = CRIATURAS[tipo];
    const emCasa = naIlha(this.casa, Math.floor(x), Math.floor(y));
    if (def.comportamento === 'hostil') {
      if (this.pertoDoFogo(x, y)) return;
      if (emCasa && !noite) tipo = 'coelho'; // de dia sua ilha é tranquila
    }
    this.adicionar(tipo, x, y);
  }

  adicionar(tipo: TipoCriatura, x: number, y: number) {
    const c = novaCriatura(this.proximoId++, tipo, x, y);
    const s = this.scene.add.sprite(x * T, y * T, `cri-${tipo}`, 0).setOrigin(0.5, 0.85);
    s.play({ key: `cri-${tipo}`, startFrame: Math.floor(this.rng() * 2) });
    s.setAlpha(0);
    this.scene.tweens.add({ targets: s, alpha: 1, duration: 400 });
    const barra = this.scene.add.graphics().setDepth(5000);
    const b = { c, s, barra };
    this.lista.push(b);
    return b;
  }

  remover(b: Bicho) {
    b.s.destroy(); b.barra.destroy();
    this.lista.splice(this.lista.indexOf(b), 1);
  }

  /** Atualiza IA e desenho. Retorna o dano total causado ao jogador neste quadro. */
  atualizar(dt: number, jx: number, jy: number, vivo: boolean, noite: boolean): number {
    let dano = 0;
    const ctx = { jogador: { x: jx, y: jy, vivo }, andavel: this.andavel, rng: this.rng };
    for (const b of [...this.lista]) {
      const { c, s } = b;
      const dist = Math.hypot(c.x - jx, c.y - jy);
      const def = CRIATURAS[c.tipo];
      if (dist > 28 || (def.noturno && !noite && dist > 10)) { this.remover(b); continue; }
      // Fogo espanta os hostis: não perseguem dentro do raio da fogueira.
      const protegido = def.comportamento === 'hostil' && this.pertoDoFogo(jx, jy, 4);
      dano += atualizarCriatura(c, protegido ? { ...ctx, jogador: { ...ctx.jogador, vivo: false } } : ctx, dt);
      s.setPosition(c.x * T, c.y * T).setDepth(s.y);
      if (Math.abs(c.dir[0]) > 0.1) s.setFlipX(c.dir[0] > 0);
      s.anims.timeScale = c.estado === 'parado' ? 0.3 : 1.4;
      b.barra.clear();
      if (c.vida < def.vida) {
        const w = 12, x = s.x - w / 2, y = s.y - 15;
        b.barra.fillStyle(0x3a2f45).fillRect(x - 1, y - 1, w + 2, 4);
        b.barra.fillStyle(0xe0503c).fillRect(x, y, (w * Math.max(0, c.vida)) / def.vida, 2);
      }
    }
    return dano;
  }

  /** Criatura mais próxima à frente do jogador, ao alcance de um golpe. */
  alvo(jx: number, jy: number, dir: [number, number]): Bicho | null {
    let melhor: Bicho | null = null, menor = Infinity;
    for (const b of this.lista) {
      const dx = b.c.x - jx, dy = b.c.y - (jy - 0.2), d = Math.hypot(dx, dy);
      if (d > 1.35) continue;
      const frente = d < 0.5 || (dx * dir[0] + dy * dir[1]) / d > 0.1;
      if (frente && d < menor) { menor = d; melhor = b; }
    }
    return melhor;
  }

  /** Aplica um golpe; empurra a criatura e pisca. Retorna true se morreu. */
  ferir(b: Bicho, dano: number, deX: number, deY: number): boolean {
    const morreu = ferirCriatura(b.c, dano);
    b.s.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => b.s.active && b.s.clearTint());
    const dx = b.c.x - deX, dy = b.c.y - deY, d = Math.hypot(dx, dy) || 1;
    const nx = b.c.x + (dx / d) * 0.35, ny = b.c.y + (dy / d) * 0.35;
    if (this.andavel(Math.floor(nx), Math.floor(ny))) { b.c.x = nx; b.c.y = ny; }
    if (morreu) {
      b.barra.destroy();
      this.lista.splice(this.lista.indexOf(b), 1);
      this.scene.tweens.add({ targets: b.s, alpha: 0, scaleY: 0.2, duration: 250, onComplete: () => b.s.destroy() });
    }
    return morreu;
  }
}
