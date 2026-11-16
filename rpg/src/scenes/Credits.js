import { CREDITS } from '../data.js';
import { button, COLORS, label, title } from '../ui.js';

export class Credits extends Phaser.Scene {
  constructor() { super('Credits'); }

  create() {
    this.add.tileSprite(0, 0, 1280, 720, 'ui_wood').setOrigin(0).setTint(0x5a4636);
    title(this, 640, 60, 'Créditos', 50);
    CREDITS.forEach(([what, who], i) => {
      const y = 130 + i * 38;
      label(this, 620, y, what, { size: 21, ox: 1 });
      label(this, 650, y, who, { size: 21, color: COLORS.gold });
    });
    button(this, 640, 660, 260, 56, 'Voltar', () => this.scene.start('Camp'));
  }
}
