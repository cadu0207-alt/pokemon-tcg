import { PHASES, UPGRADES, upgradeCost } from '../data.js';
import { heroStatsFromSave, loadSave, writeSave } from '../save.js';
import { button, COLORS, formatNumber, label, title } from '../ui.js';

// Acampamento: gasta o ouro em melhorias permanentes e parte para a fase.
export class Camp extends Phaser.Scene {
  constructor() { super('Camp'); }

  create() {
    this.save = loadSave();

    this.add.tileSprite(0, 0, 1280, 720, 'ui_wood').setOrigin(0).setTint(0x8a6a50);
    this.add.rectangle(640, 360, 1280, 720, 0x140c06, 0.35);
    title(this, 640, 58, 'Acampamento', 54);

    this.add.image(1110, 58, 'icon_coin').setDisplaySize(56, 56);
    this.goldText = label(this, 1146, 58, '', { size: 34, color: COLORS.gold });

    // herói
    const meta = this.registry.get('manifest').characters.warrior;
    this.add.ellipse(250, 470, 260, 46, 0x000000, 0.4);
    this.add.sprite(250, 470, 'warrior_idle').setOrigin(meta.anchorX, 1).setScale(1.45).play('warrior-idle');
    label(this, 250, 510, 'Guerreira', { size: 30, ox: 0.5, color: COLORS.gold });
    this.statsText = label(this, 250, 590, '', { size: 20, ox: 0.5, align: 'center' });

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
      label(this, 250, 660, `Salvando na nuvem: ${email}`, { size: 16, ox: 0.5, color: '#9fd99f' });
    } else {
      const login = label(this, 250, 660, 'Entre no MyDeck para salvar na nuvem', { size: 16, ox: 0.5, color: '#ffcf7a' })
        .setInteractive({ useHandCursor: true });
      login.on('pointerup', () => { window.location.href = '/'; });
    }
    const fs = label(this, 30, 700, 'Tela cheia', { size: 18, color: '#d9c7a0' }).setInteractive({ useHandCursor: true });
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
    const s = heroStatsFromSave(this.save);
    this.statsText.setText(
      `Vida ${s.maxHp}   Dano ${Math.round(s.dmgMin)}–${Math.round(s.dmgMax)}\n` +
      `Crítico ${Math.round(s.crit * 100)}%   Poções ${s.potions}\n` +
      `Recorde: onda ${this.save.bestWave}   Vitórias ${this.save.wins}`,
    );
  }
}
