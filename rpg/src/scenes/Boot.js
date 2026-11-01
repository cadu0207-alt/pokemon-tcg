import { loadSave } from '../save.js';
import { title, label } from '../ui.js';

// Carrega tudo o que está no manifest.json e cria as animações.
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const m = this.registry.get('manifest');
    this.load.setPath('assets/');

    title(this, 640, 300, 'Encantados', 64);
    const bar = this.add.graphics();
    const info = label(this, 640, 420, 'Carregando...', { ox: 0.5 });
    this.load.on('progress', p => {
      bar.clear();
      bar.fillStyle(0x2a1a0e, 1).fillRoundedRect(440, 370, 400, 18, 9);
      bar.fillStyle(0xffd34d, 1).fillRoundedRect(440, 370, 400 * p, 18, 9);
      info.setText(`Carregando... ${Math.round(p * 100)}%`);
    });

    // Encantados e peças são SVGs próprios (pasta art/), rasterizados no carregamento.
    for (const [name, file] of Object.entries(m.creatures)) this.load.svg(`cr_${name}`, file, { width: 300, height: 250 });
    for (const [name, file] of Object.entries(m.parts)) this.load.svg(`part_${name}`, file, { scale: 1 });
    for (const [bg, layers] of Object.entries(m.backgrounds)) {
      for (const l of layers) this.load.image(`bg_${bg}_${l.key}`, l.file);
    }
    for (const [rarity, file] of Object.entries(m.cardFrames)) this.load.image(`frame_${rarity}`, file);
    for (const [key, file] of Object.entries(m.icons)) this.load.image(`icon_${key}`, file);
    for (const [key, file] of Object.entries(m.ui)) this.load.image(`ui_${key}`, file);
    for (const [key, file] of Object.entries(m.audio)) this.load.audio(key, file);
    this.load.spritesheet('slash', m.slash.file, { frameWidth: m.slash.frameWidth, frameHeight: m.slash.frameHeight });
  }

  create() {
    this.anims.create({ key: 'slash', frames: this.anims.generateFrameNumbers('slash'), frameRate: 24, hideOnComplete: true });
    this.scene.start(loadSave().creatures.length ? 'Camp' : 'Starter');
  }
}
