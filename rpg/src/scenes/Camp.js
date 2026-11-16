import { PHASES, SANCTUARY_SLOTS, UPGRADES, upgradeCost } from '../data.js';
import { SPECIES, buildCreature, playIdle } from '../creatures.js';
import { creatureStatsFromSave, loadSave, writeSave } from '../save.js';
import { button, COLORS, formatNumber, label, title } from '../ui.js';

// Santuário: escolhe o Encantado ativo, gasta o ouro em melhorias permanentes e parte para a fase.
export class Camp extends Phaser.Scene {
  constructor() { super('Camp'); }

  create() {
    this.save = loadSave();

    this.add.tileSprite(0, 0, 1280, 720, 'ui_wood').setOrigin(0).setTint(0x8a6a50);
    this.add.rectangle(640, 360, 1280, 720, 0x140c06, 0.35);
    title(this, 640, 58, 'Santuário', 54);

    this.add.image(1110, 58, 'icon_coin').setDisplaySize(56, 56);
    this.goldText = label(this, 1146, 58, '', { size: 34, color: COLORS.gold });

    // Encantado ativo e lista do Santuário
    this.heroSlot = this.add.container(0, 0);
    this.nameText = label(this, 250, 430, '', { size: 30, ox: 0.5, color: COLORS.gold });
    this.statsText = label(this, 250, 500, '', { size: 19, ox: 0.5, align: 'center' });
    label(this, 250, 572, `Santuário (${this.save.creatures.length}/${SANCTUARY_SLOTS}) · toque para escolher`, { size: 16, ox: 0.5, color: '#d9c7a0' });
    this.roster = this.add.container(0, 0);

    // melhorias
    this.add.image(800, 365, 'ui_paper').setDisplaySize(740, 470).setAlpha(0.96);
    label(this, 800, 160, 'Melhorias permanentes', { size: 28, ox: 0.5, color: COLORS.ink, stroke: '#000', strokeThickness: 0, weight: '800' });
    this.rows = UPGRADES.map((u, i) => this.buildRow(u, 800, 230 + i * 100));

    const phase = PHASES[0];
    button(this, 800, 655, 470, 70, `Partir: ${phase.name}`, () => this.scene.start('Battle', { phase: 0 }), { size: 26, color: 0x7a2d1a });
    const credits = label(this, 1250, 700, 'Créditos', { size: 18, ox: 1, color: '#d9c7a0' }).setInteractive({ useHandCursor: true });
    credits.on('pointerup', () => this.scene.start('Credits'));
    const email = this.registry.get('cloudEmail');
    if (email) {
      label(this, 640, 700, `Salvando na nuvem: ${email}`, { size: 16, ox: 0.5, color: '#9fd99f' });
    } else {
      const login = label(this, 640, 700, 'Entre no MyDeck para salvar na nuvem', { size: 16, ox: 0.5, color: '#ffcf7a' })
        .setInteractive({ useHandCursor: true });
      login.on('pointerup', () => { window.location.href = '/'; });
    }
    const fs = label(this, 30, 40, 'Tela cheia', { size: 18, color: '#d9c7a0' }).setInteractive({ useHandCursor: true });
    fs.on('pointerup', () => (this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen()));

    this.sound.stopAll();
    this.sound.add('music_camp', { loop: true, volume: 0.35 }).play();
    this.refresh();
  }

  buildRow(u, cx, y) {
    const ink = { color: COLORS.ink, stroke: '#000', strokeThickness: 0 };
    this.add.image(cx - 310, y, `icon_${u.icon}`).setDisplaySize(72, 72);
    const name = label(this, cx - 260, y - 18, '', { size: 26, weight: '800', ...ink });
    const desc = label(this, cx - 260, y + 16, '', { size: 20, weight: '700', ...ink, color: '#5a3b1e' });
    const btn = button(this, cx + 230, y, 220, 56, '', () => this.buy(u), { size: 21, color: 0x3f6b2a });
    return { u, name, desc, btn };
  }

  buy(u) {
    const level = this.save.upgrades[u.id];
    const cost = upgradeCost(u, level);
    if (level >= u.max || this.save.gold < cost) return;
    this.save.gold -= cost;
    this.save.upgrades[u.id] = level + 1;
    writeSave(this.save);
    this.sound.play('card', { volume: 0.5 });
    this.refresh();
  }

  refresh() {
    this.goldText.setText(formatNumber(this.save.gold));
    for (const { u, name, desc, btn } of this.rows) {
      const level = this.save.upgrades[u.id];
      const maxed = level >= u.max;
      const cost = upgradeCost(u, level);
      name.setText(`${u.name}  ${level}/${u.max}`);
      desc.setText(level > 0 ? u.desc(level) : `Próximo nível: ${u.desc(1)}`);
      btn.setText(maxed ? 'Máximo' : `Melhorar: ${formatNumber(cost)}`);
      btn.setEnabled(!maxed && this.save.gold >= cost);
    }
    this.drawCreatures();
  }

  drawCreatures() {
    const active = this.save.creatures[this.save.active];
    const sp = SPECIES[active.species];
    this.heroSlot.removeAll(true);
    const cr = buildCreature(this, active.species, 250, 400, { scale: 0.95 });
    playIdle(this, cr);
    this.heroSlot.add(cr);
    this.nameText.setText(`${sp.name}${active.variant ? ' ✦' : ''} · ${sp.type}`);

    const s = creatureStatsFromSave(this.save);
    this.statsText.setText(
      `Vida ${s.maxHp}   Dano ${Math.round(s.dmgMin)}–${Math.round(s.dmgMax)}   Defesa ${Math.round(s.defense * 100)}%\n` +
      `Temperamento ${active.temperament}   Garrafadas ${s.potions}\n` +
      `Recorde: onda ${this.save.bestWave}   Vitórias ${this.save.wins}`,
    );

    // miniaturas: até 12, em duas linhas de 6
    this.roster.removeAll(true);
    this.save.creatures.forEach((c, i) => {
      const x = 70 + (i % 6) * 72;
      const y = 625 + Math.floor(i / 6) * 62;
      const selected = i === this.save.active;
      const bg = this.add.circle(x, y - 18, 30, selected ? 0xffd34d : 0x000000, selected ? 0.55 : 0.35)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerup', () => { this.save.active = i; writeSave(this.save); this.refresh(); });
      const mini = buildCreature(this, c.species, x, y, { scale: 0.22 });
      mini.list[0].setVisible(false); // sem sombra na miniatura
      this.roster.add([bg, mini]);
    });
  }
}
