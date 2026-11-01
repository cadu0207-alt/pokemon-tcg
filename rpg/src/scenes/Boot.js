import { title, label } from '../ui.js';

const FRAME_RATES = { idle: 8, walk: 10, attack: 16, hurt: 12, die: 10 };
const LOOPING = new Set(['idle', 'walk']);

// Carrega tudo o que está no manifest.json e cria as animações.
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const m = this.registry.get('manifest');
    this.load.setPath('assets/');

    title(this, 640, 300, 'RPG BD', 64);
    const bar = this.add.graphics();
    const info = label(this, 640, 420, 'Carregando...', { ox: 0.5 });
    this.load.on('progress', p => {
      bar.clear();
      bar.fillStyle(0x2a1a0e, 1).fillRoundedRect(440, 370, 400, 18, 9);
      bar.fillStyle(0xffd34d, 1).fillRoundedRect(440, 370, 400 * p, 18, 9);
      info.setText(`Carregando... ${Math.round(p * 100)}%`);
    });

    for (const [name, c] of Object.entries(m.characters)) {
      for (const [anim, a] of Object.entries(c.anims)) {
        this.load.spritesheet(`${name}_${anim}`, a.file, { frameWidth: c.frameWidth, frameHeight: c.frameHeight });
      }
    }
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
    const m = this.registry.get('manifest');
    for (const [name, c] of Object.entries(m.characters)) {
      for (const anim of Object.keys(c.anims)) {
        this.anims.create({
          key: `${name}-${anim}`,
          frames: this.anims.generateFrameNumbers(`${name}_${anim}`),
          frameRate: FRAME_RATES[anim],
          repeat: LOOPING.has(anim) ? -1 : 0,
        });
      }
    }
    this.anims.create({ key: 'slash', frames: this.anims.generateFrameNumbers('slash'), frameRate: 24, hideOnComplete: true });
    this.scene.start('Camp');
  }
}
