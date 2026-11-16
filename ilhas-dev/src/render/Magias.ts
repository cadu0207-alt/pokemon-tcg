import Phaser from 'phaser';
import { MAGIAS, type Magia } from '../sim/habilidades';
import type { Fauna } from './Fauna';
import { T } from './texturas';

interface Projetil { o: Phaser.GameObjects.Arc; vx: number; vy: number; resta: number; }

/** Efeitos das magias: projéteis, área, buffs. As regras de mana ficam na cena. */
export class Magias {
  private projeteis: Projetil[] = [];
  escudoAte = 0;
  ventoAte = 0;
  private recarga = new Map<Magia, number>();

  constructor(private scene: Phaser.Scene, private fauna: Fauna, private aoFerir: (b: import('./Fauna').Bicho, dano: number) => void) {}

  pronta(m: Magia, agora: number) { return agora >= (this.recarga.get(m) ?? 0); }
  progressoRecarga(m: Magia, agora: number) {
    const fim = this.recarga.get(m) ?? 0;
    return fim <= agora ? 1 : 1 - (fim - agora) / MAGIAS[m].recarga;
  }

  /** Lança a magia; retorna a cura (para "agua") ou 0. */
  lancar(m: Magia, agora: number, x: number, y: number, dir: [number, number]): number {
    this.recarga.set(m, agora + MAGIAS[m].recarga);
    switch (m) {
      case 'faisca': {
        const o = this.scene.add.circle(x, y - 6, 3, 0xff9a3c).setStrokeStyle(1, 0xffe07a).setDepth(29000);
        this.projeteis.push({ o, vx: dir[0] * 9 * T, vy: dir[1] * 9 * T, resta: 0.75 });
        return 0;
      }
      case 'agua':
        this.anel(x, y, 0x7fd6ff, 14);
        return 10;
      case 'pedra':
        this.escudoAte = agora + 8000; this.anel(x, y, 0xb9b4b0, 12);
        return 0;
      case 'vento':
        this.ventoAte = agora + 5000; this.anel(x, y, 0xe8fbff, 18);
        return 0;
      case 'chuva':
        this.anel(x, y, 0xff6a3c, 2.5 * T);
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * 2.5 * T;
          const f = this.scene.add.circle(x + Math.cos(a) * d, y + Math.sin(a) * d - 30, 2, 0xffb04a).setDepth(29000);
          this.scene.tweens.add({ targets: f, y: f.y + 30, alpha: 0.2, duration: 350 + Math.random() * 200, onComplete: () => f.destroy() });
        }
        for (const b of [...this.fauna.lista]) if (Math.hypot(b.c.x * T - x, b.c.y * T - y) < 2.5 * T) this.aoFerir(b, 12);
        return 0;
    }
  }

  private anel(x: number, y: number, cor: number, raio: number) {
    const c = this.scene.add.circle(x, y - 4, 2, cor, 0).setStrokeStyle(2, cor).setDepth(29000);
    this.scene.tweens.add({ targets: c, radius: raio, alpha: 0, duration: 450, onComplete: () => c.destroy() });
  }

  atualizar(dt: number, solido: (px: number, py: number) => boolean) {
    for (const p of [...this.projeteis]) {
      p.o.x += (p.vx * dt) / 1000; p.o.y += (p.vy * dt) / 1000; p.resta -= dt / 1000;
      const alvo = this.fauna.lista.find(b => Math.hypot(b.c.x * T - p.o.x, b.c.y * T - 6 - p.o.y) < T * 0.6);
      if (alvo) this.aoFerir(alvo, 7);
      if (alvo || p.resta <= 0 || solido(p.o.x, p.o.y + 6)) {
        this.anel(p.o.x, p.o.y + 4, 0xff9a3c, 8);
        p.o.destroy(); this.projeteis.splice(this.projeteis.indexOf(p), 1);
      }
    }
  }
}
