import { loadSave, writeSave } from '../save.js';
import { button, COLORS, formatNumber, label, title } from '../ui.js';

// Tela de fim de fase. Quem cai leva metade do ouro; quem vence leva tudo.
export class Result extends Phaser.Scene {
  constructor() { super('Result'); }

  create(data) {
    const earned = data.won ? data.gold : Math.floor(data.gold / 2);
    const save = loadSave();
    save.gold += earned;
    save.bestWave = Math.max(save.bestWave, data.wave);
    if (data.won) save.wins++;
    writeSave(save);

    this.add.tileSprite(0, 0, 1280, 720, 'ui_wood').setOrigin(0).setTint(0x5a4636);
    const panel = this.add.image(640, 380, 'ui_paper').setDisplaySize(720, 520);
    panel.setAlpha(0.97);

    title(this, 640, 90, data.won ? 'Vitória!' : 'Você caiu...', 60);
    const lines = [
      [data.phaseName, ''],
      ['Ondas vencidas', `${Math.min(data.wave, data.totalWaves)} / ${data.totalWaves}`],
      ['Nível alcançado', `${data.level}`],
      ['Ouro coletado', formatNumber(data.gold)],
      [data.won ? 'Ouro levado ao acampamento' : 'Ouro levado (metade)', `+${formatNumber(earned)}`],
      ['Ouro guardado', formatNumber(save.gold)],
    ];
    lines.forEach(([k, v], i) => {
      const y = 200 + i * 52;
      const head = i === 0;
      label(this, head ? 640 : 340, y, k, {
        size: head ? 30 : 26, ox: head ? 0.5 : 0, color: COLORS.ink, stroke: '#000', strokeThickness: 0, weight: '800',
      });
      if (v) label(this, 940, y, v, { size: 28, ox: 1, color: i >= 4 ? '#8a5a00' : COLORS.ink, stroke: '#000', strokeThickness: 0, weight: '800' });
    });

    button(this, 640, 600, 380, 64, 'Voltar ao acampamento', () => this.scene.start('Camp'), { size: 26 });
  }
}
