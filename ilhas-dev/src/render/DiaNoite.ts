import Phaser from 'phaser';
import { escuridao } from '../sim/criaturas';
import { T } from './texturas';

/** Escurece a tela à noite e faz as fogueiras brilharem. */
export class DiaNoite {
  private veu: Phaser.GameObjects.Rectangle;
  private brilhos = new Map<string, Phaser.GameObjects.Image>();

  constructor(private scene: Phaser.Scene) {
    this.veu = scene.add.rectangle(0, 0, 10, 10, 0x1a1840).setOrigin(0).setDepth(20000).setAlpha(0);
  }

  objetos() { return [this.veu]; }

  atualizar(tempo: number, fogueiras: { x: number; y: number }[], t: number) {
    const e = escuridao(tempo);
    const v = this.scene.cameras.main.worldView;
    this.veu.setPosition(v.x - 2, v.y - 2).setSize(v.width + 4, v.height + 4).setAlpha(e * 0.58);
    const vistos = new Set<string>();
    for (const f of fogueiras) {
      const k = `${f.x},${f.y}`; vistos.add(k);
      let b = this.brilhos.get(k);
      if (!b) {
        b = this.scene.add.image((f.x + 0.5) * T, (f.y + 0.5) * T, 'brilho')
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(20001).setScale(1.3);
        this.brilhos.set(k, b);
      }
      b.setAlpha(e * (0.75 + Math.sin(t / 180 + f.x) * 0.08));
    }
    for (const [k, b] of this.brilhos) if (!vistos.has(k)) { b.destroy(); this.brilhos.delete(k); }
    return e;
  }

  todos() { return [this.veu, ...this.brilhos.values()]; }
}
