import { ENEMIES, PHASES, POTION_HEAL, WAVE_HEAL, rollCards, scaleEnemy, waveEnemies, xpToLevel } from '../data.js';
import { heroStatsFromSave, loadSave } from '../save.js';
import { COLORS, formatNumber, imageBar, label } from '../ui.js';

const W = 1280;
const GROUND_Y = 640;
const HERO_X = 300;
const WALK_SPEED = 230; // px/s que o cenário anda enquanto o herói caminha
const FIRST_SLOT = 165; // distância do herói ao primeiro inimigo da fila
const SLOT_GAP = 125;

// Fatores de parallax de cada camada do cenário (0 = parada, 1 = anda junto com o chão).
const PARALLAX = { sky: 0, cloud: 0.04, mountains: 0.08, hills_back: 0.18, hills_mid: 0.32, trees: 0.55, ground: 1 };

export class Battle extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) {
    this.phase = PHASES[data.phase || 0];
  }

  create() {
    this.save = loadSave();
    this.stats = heroStatsFromSave(this.save);
    this.run = { level: 1, xp: 0, gold: 0, wave: 0, cards: {}, pendingLevels: 0, ended: false, phaseGold: 0 };
    this.enemies = [];
    this.state = 'walking';
    this.walkTimer = 1.2;
    this.heroAtkTimer = 0.3;
    this.heroBusy = false;

    this.buildBackground();
    this.manifest = this.registry.get('manifest');
    this.hero = this.makeSprite('warrior', HERO_X, false);
    this.hero.play('warrior-walk');
    this.buildHud();

    this.sound.stopAll();
    this.music = this.sound.add('music_battle', { loop: true, volume: 0.35 });
    this.music.play();

    this.input.keyboard?.on('keydown-Q', () => this.drinkPotion());
    this.events.on('resume', () => this.refreshHud());
  }

  // ---------- montagem ----------

  buildBackground() {
    const layers = this.registry.get('manifest').backgrounds[this.phase.bg];
    this.layers = layers.map(l => {
      const key = `bg_${this.phase.bg}_${l.key}`;
      const y = l.key === 'sky' ? 0 : l.key === 'cloud' ? 30 : 720 - l.height;
      const ts = this.add.tileSprite(0, y, W, l.height, key).setOrigin(0, 0);
      ts.parallax = PARALLAX[l.key] ?? 0.5;
      return ts;
    });
  }

  makeSprite(name, x, facingLeft, scale = 1) {
    const meta = this.registry.get('manifest').characters[name];
    const s = this.add.sprite(x, GROUND_Y, `${name}_idle`);
    s.setOrigin(facingLeft ? 1 - meta.anchorX : meta.anchorX, 1);
    s.setFlipX(facingLeft);
    s.setScale(scale);
    s.charName = name;
    return s;
  }

  buildHud() {
    // ouro
    this.add.image(46, 44, 'icon_coin').setDisplaySize(52, 52);
    this.goldText = label(this, 80, 44, '0', { size: 32, color: COLORS.gold });

    // progresso da fase
    label(this, W / 2, 26, this.phase.name, { size: 22, ox: 0.5 });
    this.progress = this.add.graphics();

    // vida do herói (acima da cabeça)
    this.heroBar = imageBar(this, HERO_X - 10, GROUND_Y - 235, 170, 16, 'ui_bar_hp');
    this.heroHpText = label(this, HERO_X - 10, GROUND_Y - 258, '', { size: 18, ox: 0.5 });

    // XP e nível
    this.xpBar = imageBar(this, W / 2, 690, 520, 18, 'ui_bar_xp');
    this.levelText = label(this, W / 2 - 280, 690, '', { size: 22, ox: 1, color: COLORS.gold });

    // poção
    const potion = this.add.image(W - 70, 650, 'icon_potion').setDisplaySize(88, 88).setInteractive({ useHandCursor: true });
    potion.on('pointerup', () => this.drinkPotion());
    this.potionIcon = potion;
    this.potionText = label(this, W - 34, 690, '', { size: 26, ox: 0.5 });

    // cartas ganhas nesta fase
    this.cardIcons = this.add.container(24, 600);

    this.enemyBars = this.add.graphics();
    this.refreshHud();
  }

  refreshHud() {
    const s = this.stats;
    this.goldText.setText(formatNumber(this.run.gold));
    this.heroBar.setRatio(s.hp / s.maxHp);
    this.heroHpText.setText(`${Math.ceil(s.hp)} / ${s.maxHp}`);
    const need = xpToLevel(this.run.level);
    this.xpBar.setRatio(this.run.xp / need);
    this.levelText.setText(`Nível ${this.run.level}`);
    this.potionText.setText(`${s.potions}`);
    this.potionIcon.setAlpha(s.potions > 0 ? 1 : 0.35);

    // barra de progresso: uma marca por onda + chefe
    const g = this.progress.clear();
    const total = this.phase.waves + 1;
    const x0 = W / 2 - 260;
    const step = 520 / (total - 1);
    g.lineStyle(4, 0x2a1a0e, 1).lineBetween(x0, 56, x0 + 520, 56);
    g.lineStyle(4, 0xffd34d, 1).lineBetween(x0, 56, x0 + step * Math.min(this.run.wave, total - 1), 56);
    for (let i = 0; i < total; i++) {
      const done = i < this.run.wave;
      const boss = i === total - 1;
      g.fillStyle(done ? 0xffd34d : 0x4a3524, 1).fillCircle(x0 + step * i, 56, boss ? 11 : 7);
      g.lineStyle(2, 0x1a0f06, 1).strokeCircle(x0 + step * i, 56, boss ? 11 : 7);
    }

    this.cardIcons.removeAll(true);
    Object.entries(this.run.cards).forEach(([id, count], i) => {
      const x = (i % 10) * 46;
      const y = -Math.floor(i / 10) * 46;
      this.cardIcons.add(this.add.image(x + 20, y, `icon_${id}`).setDisplaySize(40, 40));
      if (count > 1) this.cardIcons.add(label(this, x + 34, y + 14, `${count}`, { size: 16, ox: 0.5, color: COLORS.gold }));
    });
  }

  // ---------- ciclo principal ----------

  update(_time, deltaMs) {
    if (this.run.ended) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    const s = this.stats;

    if (s.regen > 0 && s.hp > 0) s.hp = Math.min(s.maxHp, s.hp + s.regen * dt);

    if (this.state === 'walking') this.updateWalking(dt);
    else this.updateFighting(dt);

    this.updateBurns(dt);
    this.drawEnemyBars();
    this.heroBar.setRatio(s.hp / s.maxHp);
    this.heroHpText.setText(`${Math.ceil(s.hp)} / ${s.maxHp}`);
  }

  updateWalking(dt) {
    const scroll = WALK_SPEED * dt;
    for (const l of this.layers) l.tilePositionX += scroll * l.parallax / (l.scaleX || 1);

    if (this.enemies.length === 0) {
      this.walkTimer -= dt;
      if (this.walkTimer <= 0) this.spawnWave();
      return;
    }
    // inimigos se aproximam enquanto o herói anda
    this.moveEnemies(dt, scroll);
    const front = this.frontEnemy();
    if (front && front.arrived) {
      this.state = 'fighting';
      this.hero.play('warrior-idle');
    }
  }

  updateFighting(dt) {
    this.moveEnemies(dt, 0);
    const front = this.frontEnemy();
    if (!front) return;

    if (front.arrived && !this.heroBusy) {
      this.heroAtkTimer -= dt;
      if (this.heroAtkTimer <= 0) this.heroAttack(front);
    }

    if (front.arrived && !front.busy) {
      front.atkTimer -= dt;
      if (front.atkTimer <= 0) this.enemyAttack(front);
    }
  }

  frontEnemy() {
    return this.enemies.find(e => !e.dead);
  }

  moveEnemies(dt, scroll) {
    let slot = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const target = HERO_X + FIRST_SLOT * e.def.scaleMul + slot * SLOT_GAP;
      slot++;
      if (e.sprite.x > target) {
        e.sprite.x = Math.max(target, e.sprite.x - scroll - 110 * dt);
        if (e.sprite.anims.currentAnim?.key !== `${e.name}-walk` && !e.busy) e.sprite.play(`${e.name}-walk`);
        e.arrived = false;
      } else if (!e.arrived) {
        e.arrived = true;
        if (!e.busy) e.sprite.play(`${e.name}-idle`);
      }
    }
  }

  spawnWave() {
    const list = waveEnemies(this.phase, this.run.wave);
    list.forEach((name, i) => {
      const def = scaleEnemy(ENEMIES[name], this.run.wave);
      def.scaleMul = def.scale || 1;
      const sprite = this.makeSprite(name, W + 120 + i * 170, true, def.scaleMul);
      sprite.play(`${name}-walk`);
      this.enemies.push({
        name, def, sprite, hp: def.hp, maxHp: def.hp,
        atkTimer: def.interval * 0.6, arrived: false, busy: false, dead: false, burn: 0, burnTime: 0, burnAcc: 0,
      });
    });
    this.children.bringToTop(this.hero);
    if (ENEMIES[list[0]].boss) this.announce('O Cavaleiro Negro bloqueia o caminho!');
  }

  // ---------- combate ----------

  heroAttack(target) {
    const s = this.stats;
    this.heroBusy = true;
    this.heroAtkTimer = s.atkInterval;
    this.hero.play('warrior-attack');
    this.sound.play('swing', { volume: 0.5 });
    this.time.delayedCall(170, () => {
      this.strike(target);
      if (Math.random() < s.doubleChance) this.time.delayedCall(160, () => this.strike(this.frontEnemy(), true));
    });
    this.hero.once('animationcomplete-warrior-attack', () => {
      this.heroBusy = false;
      if (!this.run.ended) this.hero.play(this.state === 'walking' ? 'warrior-walk' : 'warrior-idle');
    });
  }

  strike(target, extra = false) {
    if (!target || target.dead || this.run.ended) return;
    const s = this.stats;
    const crit = Math.random() < s.crit;
    let dmg = Phaser.Math.FloatBetween(s.dmgMin, s.dmgMax) * s.dmgMult;
    if (crit) dmg *= s.critMult;
    dmg = Math.max(1, Math.round(dmg));

    const fx = this.add.sprite(target.sprite.x - 30, GROUND_Y - 105 * target.def.scaleMul, 'slash');
    fx.setScale(crit ? 1.25 : 0.95).setAngle(extra ? 25 : -10).play('slash');
    fx.once('animationcomplete-slash', () => fx.destroy());
    if (crit) this.cameras.main.shake(120, 0.006);

    this.damageEnemy(target, dmg, crit ? 'crit' : 'normal');
    if (s.lifesteal > 0) this.healHero(dmg * s.lifesteal, false);
    if (s.burn > 0) { target.burn = s.burn; target.burnTime = 3; }
  }

  damageEnemy(e, dmg, kind) {
    if (e.dead) return;
    e.hp -= dmg;
    const color = kind === 'crit' ? COLORS.gold : kind === 'burn' ? '#ff9a3c' : kind === 'blast' ? '#ff6b3c' : '#ffffff';
    this.floatText(e.sprite.x - 20, GROUND_Y - 190 * e.def.scaleMul, kind === 'crit' ? `${dmg}!` : `${dmg}`, color, kind === 'crit' ? 40 : 28);

    if (kind !== 'burn') {
      e.sprite.setTintFill(0xffffff);
      this.time.delayedCall(70, () => e.sprite.active && e.sprite.clearTint());
      this.sound.play('hit', { volume: 0.35, rate: Phaser.Math.FloatBetween(0.9, 1.1) });
    }
    if (e.hp <= 0) return this.killEnemy(e);
    if (!e.busy && kind !== 'burn') {
      e.sprite.play(`${e.name}-hurt`);
      e.sprite.once(`animationcomplete-${e.name}-hurt`, () => !e.dead && !e.busy && e.sprite.play(`${e.name}-${e.arrived ? 'idle' : 'walk'}`));
    }
  }

  killEnemy(e) {
    e.dead = true;
    e.busy = true;
    e.sprite.play(`${e.name}-die`);
    e.sprite.once(`animationcomplete-${e.name}-die`, () => {
      this.tweens.add({ targets: e.sprite, alpha: 0, duration: 500, delay: 300, onComplete: () => e.sprite.destroy() });
    });

    const s = this.stats;
    const gold = Math.round(e.def.gold * s.goldMult);
    const xp = Math.round(e.def.xp * s.xpMult);
    this.run.gold += gold;
    this.run.phaseGold += gold;
    this.floatText(e.sprite.x, GROUND_Y - 240 * e.def.scaleMul, `+${gold} ouro`, COLORS.gold, 24, 900);

    if (s.explode > 0) {
      const next = this.enemies.find(o => !o.dead);
      if (next) this.time.delayedCall(250, () => this.damageEnemy(next, Math.round(e.maxHp * s.explode), 'blast'));
    }

    this.refreshHud();
    if (xp > 0) this.gainXp(xp);
    if (this.enemies.every(o => o.dead)) this.time.delayedCall(700, () => this.waveCleared(e.def.boss));
  }

  waveCleared(wasBoss) {
    if (this.run.ended) return;
    this.enemies = [];
    if (this.stats.interest > 0) {
      const bonus = Math.round(this.run.phaseGold * this.stats.interest);
      if (bonus > 0) {
        this.run.gold += bonus;
        this.floatText(HERO_X, GROUND_Y - 300, `Juros +${bonus}`, COLORS.gold, 26, 1100);
      }
    }
    this.run.wave++;
    if (wasBoss) {
      this.refreshHud();
      return this.endRun(true);
    }
    this.healHero(this.stats.maxHp * WAVE_HEAL);
    this.refreshHud();
    this.state = 'walking';
    this.walkTimer = 1.1;
    if (!this.heroBusy) this.hero.play('warrior-walk');
  }

  enemyAttack(e) {
    e.busy = true;
    e.atkTimer = e.def.interval;
    e.sprite.play(`${e.name}-attack`);
    this.time.delayedCall(280, () => {
      if (!e.dead && !this.run.ended) this.hitHero(e.def.dmg);
    });
    e.sprite.once(`animationcomplete-${e.name}-attack`, () => {
      if (e.dead) return;
      e.busy = false;
      e.sprite.play(`${e.name}-idle`);
    });
  }

  hitHero(raw) {
    const s = this.stats;
    const dmg = Math.max(1, Math.round(raw - s.armor));
    s.hp -= dmg;
    this.floatText(HERO_X - 10, GROUND_Y - 200, `-${dmg}`, COLORS.red, 30);
    this.sound.play('hero_hurt', { volume: 0.3 });
    this.hero.setTint(0xff7777);
    this.time.delayedCall(120, () => this.hero.clearTint());
    if (s.hp <= 0) {
      s.hp = 0;
      this.endRun(false);
    } else if (!this.heroBusy) {
      this.hero.play('warrior-hurt');
      this.hero.once('animationcomplete-warrior-hurt', () => !this.heroBusy && !this.run.ended && this.hero.play('warrior-idle'));
    }
  }

  updateBurns(dt) {
    for (const e of this.enemies) {
      if (e.dead || e.burnTime <= 0) continue;
      e.burnTime -= dt;
      e.burnAcc += e.burn * dt;
      if (e.burnAcc >= 2) {
        const d = Math.floor(e.burnAcc);
        e.burnAcc -= d;
        this.damageEnemy(e, d, 'burn');
      }
    }
  }

  healHero(amount, show = true) {
    const s = this.stats;
    const before = s.hp;
    s.hp = Math.min(s.maxHp, s.hp + amount);
    if (show && s.hp > before) this.floatText(HERO_X - 10, GROUND_Y - 200, `+${Math.round(s.hp - before)}`, COLORS.green, 30);
  }

  drinkPotion() {
    const s = this.stats;
    if (this.run.ended || s.potions <= 0 || s.hp >= s.maxHp) return;
    s.potions--;
    this.healHero(s.maxHp * POTION_HEAL);
    this.refreshHud();
  }

  // ---------- nível e cartas ----------

  gainXp(amount) {
    this.run.xp += amount;
    let need = xpToLevel(this.run.level);
    while (this.run.xp >= need) {
      this.run.xp -= need;
      this.run.level++;
      this.run.pendingLevels++;
      need = xpToLevel(this.run.level);
    }
    this.refreshHud();
    if (this.run.pendingLevels > 0 && !this.scene.isActive('LevelUp')) this.offerCards();
  }

  offerCards() {
    if (this.run.ended) return;
    this.sound.play('level_up', { volume: 0.5 });
    this.scene.pause();
    this.scene.launch('LevelUp', {
      level: this.run.level - this.run.pendingLevels + 1,
      cards: rollCards(3, this.stats.luck),
      onPick: card => {
        card.apply(this.stats);
        this.run.cards[card.id] = (this.run.cards[card.id] || 0) + 1;
        this.run.pendingLevels--;
        this.refreshHud();
        if (this.run.pendingLevels > 0) {
          this.time.delayedCall(10, () => this.offerCards());
        }
      },
    });
  }

  // ---------- fim da fase ----------

  endRun(won) {
    if (this.run.ended) return;
    this.run.ended = true;
    this.hero.play(won ? 'warrior-idle' : 'warrior-die');
    this.music.stop();
    this.time.delayedCall(1300, () => {
      this.scene.start('Result', {
        won,
        wave: this.run.wave,
        totalWaves: this.phase.waves + 1,
        level: this.run.level,
        gold: this.run.gold,
        phaseName: this.phase.name,
      });
    });
  }

  // ---------- efeitos visuais ----------

  floatText(x, y, text, color, size = 28, duration = 750) {
    const t = label(this, x + Phaser.Math.Between(-12, 12), y, text, { size, color, ox: 0.5, strokeThickness: 5 });
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  announce(text) {
    const t = label(this, W / 2, 200, text, { size: 34, ox: 0.5, color: COLORS.gold, strokeThickness: 6 });
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 600, onComplete: () => t.destroy() });
  }

  drawEnemyBars() {
    const g = this.enemyBars.clear();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const w = e.def.boss ? 180 : 90;
      const x = e.sprite.x - 20 - w / 2;
      const y = GROUND_Y - 215 * e.def.scaleMul;
      g.fillStyle(0x120a06, 0.85).fillRect(x - 2, y - 2, w + 4, 12);
      g.fillStyle(e.burnTime > 0 ? 0xff8a2a : 0xd2382c, 1).fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 8);
    }
  }
}
