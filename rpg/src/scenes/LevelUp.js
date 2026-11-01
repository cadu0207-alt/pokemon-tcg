import { RARITY } from '../data.js';
import { COLORS, label, title } from '../ui.js';

// Sobreposição que pausa o combate e oferece 3 cartas ao subir de nível.
export class LevelUp extends Phaser.Scene {
  constructor() { super('LevelUp'); }

  create(data) {
    this.picked = false;
    this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.72);
    title(this, 640, 78, `Nível ${data.level}!`, 52);
    label(this, 640, 132, 'Escolha uma carta', { size: 26, ox: 0.5 });

    data.cards.forEach((card, i) => {
      const x = 640 + (i - 1) * 345;
      const c = this.buildCard(card, x, 400);
      c.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, delay: i * 90, ease: 'Back.easeOut' });
      c.on('pointerup', () => this.pick(card, c, data));
    });
  }

  buildCard(card, x, y) {
    const r = RARITY[card.rarity];
    const c = this.add.container(x, y);
    const glow = this.add.graphics();
    glow.fillStyle(Phaser.Display.Color.HexStringToColor(r.color).color, 0.25).fillRoundedRect(-162, -222, 324, 444, 22);
    const frame = this.add.image(0, 0, `frame_${card.rarity}`).setDisplaySize(300, 420);
    const art = this.add.image(0, -88, card.part ? `part_${card.part}` : `icon_${card.icon}`);
    art.setScale(Math.min(176 / art.width, 176 / art.height));
    const rarity = label(this, 0, -181, card.kind ? `${r.label} · ${card.kind}` : r.label, { size: 17, ox: 0.5, color: r.color, strokeThickness: 3 });
    const name = label(this, 0, 33, card.name, { size: 21, ox: 0.5, color: COLORS.gold, strokeThickness: 4 });
    const desc = label(this, 0, 100, card.desc, {
      size: 20, ox: 0.5, align: 'center', wrap: 230, color: COLORS.ink, stroke: '#000', strokeThickness: 0,
    });
    c.add([glow, art, frame, rarity, name, desc]);
    c.setSize(300, 420).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => !this.picked && this.tweens.add({ targets: c, scale: 1.06, duration: 120 }));
    c.on('pointerout', () => !this.picked && this.tweens.add({ targets: c, scale: 1, duration: 120 }));
    return c;
  }

  pick(card, container, data) {
    if (this.picked) return;
    this.picked = true;
    this.sound.play('card', { volume: 0.6 });
    this.tweens.add({
      targets: container, scale: 1.15, duration: 180, yoyo: true,
      onComplete: () => {
        data.onPick(card);
        this.scene.resume('Battle');
        this.scene.stop();
      },
    });
  }
}
