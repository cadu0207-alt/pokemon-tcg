import { SPECIES, SPECIES_IDS, bestiaryEntry, buildCreature, playIdle, rollCreature } from '../creatures.js';
import { loadSave, writeSave } from '../save.js';
import { button, COLORS, label, title } from '../ui.js';

const INTRO = [
  'O incêndio levou a sua vila. Das brasas, uma criatura ainda filhote se ligou a você.',
  'A marca no seu braço é a primeira em vinte anos. Escolha quem nasceu das cinzas.',
];

// Primeira vez no jogo: escolha do Encantado inicial.
export class Starter extends Phaser.Scene {
  constructor() { super('Starter'); }

  create() {
    this.add.tileSprite(0, 0, 1280, 720, 'ui_wood').setOrigin(0).setTint(0x3a2c24);
    this.add.rectangle(640, 360, 1280, 720, 0x0a0806, 0.45);
    title(this, 640, 60, 'O Vínculo', 50);
    INTRO.forEach((t, i) => label(this, 640, 122 + i * 32, t, { size: 22, ox: 0.5, color: '#e8dcc0' }));

    SPECIES_IDS.forEach((id, i) => {
      const x = 640 + (i - 1) * 390;
      const sp = SPECIES[id];
      const entry = bestiaryEntry(sp.name);
      const panel = this.add.graphics();
      panel.fillStyle(sp.color, 0.16).fillRoundedRect(x - 175, 205, 350, 440, 18);
      panel.lineStyle(3, sp.color, 0.9).strokeRoundedRect(x - 175, 205, 350, 440, 18);

      const cr = buildCreature(this, id, x, 440, { scale: 0.85 });
      playIdle(this, cr);
      label(this, x, 470, sp.name, { size: 32, ox: 0.5, color: COLORS.gold, weight: '800' });
      label(this, x, 504, `Tipo ${sp.type} · ${entry.papel}`, { size: 20, ox: 0.5, color: '#e8dcc0' });
      label(this, x, 548, `${sp.special.name}: ${sp.special.desc}`, { size: 18, ox: 0.5, align: 'center', wrap: 310, color: '#cfc2a2' });
      button(this, x, 610, 240, 52, `Escolher ${sp.name}`, () => this.choose(id), { size: 22, color: 0x5a3a1a });
    });
  }

  choose(species) {
    const save = loadSave();
    save.creatures = [rollCreature(species)];
    save.active = 0;
    writeSave(save);
    this.sound.play('card', { volume: 0.6 });
    this.scene.start('Camp');
  }
}
