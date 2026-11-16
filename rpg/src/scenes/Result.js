import { CAPTURE_CHANCE, SANCTUARY_SLOTS } from '../data.js';
import { SPECIES, STAT_LABEL, bestiaryEntry, buildCreature, playIdle, rollCreature } from '../creatures.js';
import { loadSave, writeSave } from '../save.js';
import { button, COLORS, formatNumber, label, title } from '../ui.js';

// Tela de fim de fase. Quem cai leva metade do ouro; quem vence leva tudo e pode tentar uma captura.
export class Result extends Phaser.Scene {
  constructor() { super('Result'); }

  create(data) {
    const earned = data.won ? data.gold : Math.floor(data.gold / 2);
    const save = loadSave();
    save.gold += earned;
    save.bestWave = Math.max(save.bestWave, data.wave);
    if (data.won) save.wins++;
    writeSave(save);
    this.save = save;

    this.add.tileSprite(0, 0, 1280, 720, 'ui_wood').setOrigin(0).setTint(0x5a4636);
    const panel = this.add.image(400, 380, 'ui_paper').setDisplaySize(660, 520);
    panel.setAlpha(0.97);

    title(this, 640, 70, data.won ? 'Trilha liberada!' : 'Seu Encantado caiu...', 54);
    const ink = { color: COLORS.ink, stroke: '#000', strokeThickness: 0, weight: '800' };
    const lines = [
      [data.phaseName, ''],
      ['Ondas vencidas', `${Math.min(data.wave, data.totalWaves)} / ${data.totalWaves}`],
      ['Nível alcançado', `${data.level}`],
      ['Ouro coletado', formatNumber(data.gold)],
      [data.won ? 'Ouro levado ao Santuário' : 'Ouro levado (metade)', `+${formatNumber(earned)}`],
      ['Ouro guardado', formatNumber(save.gold)],
    ];
    lines.forEach(([k, v], i) => {
      const y = 180 + i * 52;
      const head = i === 0;
      label(this, head ? 400 : 110, y, k, { size: head ? 28 : 24, ox: head ? 0.5 : 0, ...ink });
      if (v) label(this, 690, y, v, { size: 26, ox: 1, ...ink, color: i >= 4 ? '#8a5a00' : COLORS.ink });
    });

    button(this, 400, 560, 360, 60, 'Voltar ao Santuário', () => this.scene.start('Camp'), { size: 24 });

    if (data.won && data.defeated.length) this.buildCapture(data.defeated);
    else if (data.won) label(this, 1000, 360, 'Nenhum Encantado ficou para trás.', { size: 22, ox: 0.5 });
  }

  // Mostra até 3 Encantados derrotados; o jogador escolhe um e tenta capturar.
  buildCapture(defeated) {
    label(this, 1000, 150, 'Purificar e capturar', { size: 30, ox: 0.5, color: COLORS.gold, weight: '800' });
    const full = this.save.creatures.length >= SANCTUARY_SLOTS;
    label(this, 1000, 186, full ? 'Santuário cheio: solte alguém para capturar.' : 'Escolha um. Só há uma tentativa.', { size: 18, ox: 0.5 });

    this.capture = { done: full, cards: [] };
    defeated.slice(0, 3).forEach((species, i) => {
      const y = 280 + i * 140;
      const rar = bestiaryEntry(SPECIES[species].name).raridade;
      const chance = CAPTURE_CHANCE[rar];
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.35).fillRoundedRect(810, y - 62, 380, 124, 14);
      const cr = buildCreature(this, species, 880, y + 50, { scale: 0.42, corrupted: true });
      playIdle(this, cr);
      label(this, 950, y - 30, SPECIES[species].name, { size: 24, color: COLORS.gold });
      label(this, 950, y, `Tipo ${SPECIES[species].type} · chance ${Math.round(chance * 100)}%`, { size: 18 });
      const btn = button(this, 1100, y + 32, 150, 42, 'Tentar', () => this.tryCapture(species, chance, cr, i), { size: 20, color: 0x3f6b2a });
      btn.setEnabled(!full);
      this.capture.cards.push({ btn, cr });
    });
  }

  tryCapture(species, chance, cr, index) {
    if (this.capture.done) return;
    this.capture.done = true;
    this.capture.cards.forEach(c => c.btn.setEnabled(false));
    this.tweens.add({
      targets: cr, scale: 1.15, duration: 160, yoyo: true, repeat: 2,
      onComplete: () => (Math.random() < chance ? this.captured(species, cr) : this.escaped(cr, index)),
    });
  }

  captured(species, cr) {
    cr.body.clearTint();
    cr.corrupted = false;
    const c = rollCreature(species);
    this.save.creatures.push(c);
    writeSave(this.save);
    this.sound.play('level_up', { volume: 0.5 });

    const stars = Object.entries(c.talent).map(([k, v]) => `${STAT_LABEL[k]} ${'★'.repeat(v)}${'☆'.repeat(5 - v)}`).join('\n');
    const box = this.add.container(1000, 360);
    const g = this.add.graphics();
    g.fillStyle(0x10180f, 0.95).fillRoundedRect(-200, -170, 400, 340, 16);
    g.lineStyle(3, 0x7fdc7f, 1).strokeRoundedRect(-200, -170, 400, 340, 16);
    box.add([
      g,
      label(this, 0, -135, `${SPECIES[species].name} se juntou a você!`, { size: 24, ox: 0.5, color: COLORS.green, weight: '800' }),
      label(this, 0, -95, `Temperamento: ${c.temperament}${c.variant ? ' · VARIANTE RARA' : ''}`, { size: 19, ox: 0.5 }),
      label(this, 0, 10, stars, { size: 20, ox: 0.5, align: 'center' }),
      label(this, 0, 130, 'Ele já está no Santuário.', { size: 18, ox: 0.5, color: '#cfc2a2' }),
    ]);
    box.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  }

  escaped(cr, index) {
    this.tweens.add({ targets: cr, x: cr.x + 400, alpha: 0, duration: 600, ease: 'Quad.easeIn' });
    label(this, 1000, 280 + index * 140 + 32, 'Fugiu para a mata...', { size: 20, ox: 0.5, color: COLORS.red });
  }
}
