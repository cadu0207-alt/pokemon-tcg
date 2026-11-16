import { CARDS, ENERGY_PER_HIT, ENERGY_PER_SEC, PHASES, POTION_HEAL, WAVE_HEAL, rollCards, waveEnemies, xpToLevel } from '../data.js';
import {
  SPECIES, SPECIES_IDS, addPart, buildCreature, enemyStats, muzzlePoint, playAttack, playFaint, playHurt, playIdle,
  playWalk, typeMultiplier,
} from '../creatures.js';
import { creatureStatsFromSave, loadSave } from '../save.js';
import { COLORS, formatNumber, imageBar, label } from '../ui.js';

const W = 1280;
const GROUND_Y = 640;
const HERO_X = 290;
const HERO_SCALE = 0.8;
const ENEMY_SCALE = 0.68;
const BOSS_SCALE = 1.0;
const WALK_SPEED = 230; // px/s que o cenário anda enquanto o Encantado caminha
const FIRST_SLOT = 215; // distância do Encantado ao primeiro inimigo da fila
const SLOT_GAP = 185;
const GUN_INTERVAL = 2;

// Fatores de parallax de cada camada do cenário (0 = parada, 1 = anda junto com o chão).
const PARALLAX = { sky: 0, cloud: 0.04, mountains: 0.08, hills_back: 0.18, hills_mid: 0.32, trees: 0.55, ground: 1 };

export class Battle extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) {
    this.phase = PHASES[data.phase || 0];
  }

  create() {
    this.save = loadSave();
    this.creature = this.save.creatures[this.save.active];
    this.species = SPECIES[this.creature.species];
    this.stats = creatureStatsFromSave(this.save);
    this.run = {
      level: 1, xp: 0, gold: 0, wave: 0, cards: {}, pendingLevels: 0, ended: false, phaseGold: 0,
      defeated: new Set(), energy: 0, gunTimer: GUN_INTERVAL, healLeft: 0, healTime: 0,
    };
    this.enemies = [];
    this.state = 'walking';
    this.walkTimer = 1.2;
    this.heroAtkTimer = 0.3;
    this.heroBusy = false;

    this.buildBackground();
    this.hero = buildCreature(this, this.creature.species, HERO_X, GROUND_Y, { scale: HERO_SCALE });
    playIdle(this, this.hero);
    playWalk(this, this.hero);
    this.buildHud();

    this.sound.stopAll();
    this.music = this.sound.add('music_battle', { loop: true, volume: 0.35 });
    this.music.play();

    this.input.keyboard?.on('keydown-Q', () => this.drinkPotion());
    this.input.keyboard?.on('keydown-E', () => this.useSpecial());
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

  buildHud() {
    // ouro
    this.add.image(46, 44, 'icon_coin').setDisplaySize(52, 52);
    this.goldText = label(this, 80, 44, '0', { size: 32, color: COLORS.gold });

    // progresso da fase
    label(this, W / 2, 26, this.phase.name, { size: 22, ox: 0.5 });
    this.progress = this.add.graphics();

    // vida do Encantado (acima da cabeça)
    this.heroBar = imageBar(this, HERO_X, GROUND_Y - 192, 170, 16, 'ui_bar_hp');
    this.heroHpText = label(this, HERO_X, GROUND_Y - 214, '', { size: 18, ox: 0.5 });
    label(this, HERO_X, GROUND_Y - 238, `${this.species.name} · ${this.species.type}`, { size: 18, ox: 0.5, color: COLORS.gold });

    // XP e nível
    this.xpBar = imageBar(this, W / 2, 690, 520, 18, 'ui_bar_xp');
    this.levelText = label(this, W / 2 - 280, 690, '', { size: 22, ox: 1, color: COLORS.gold });

    // garrafada
    const potion = this.add.image(W - 190, 655, 'icon_potion').setDisplaySize(76, 76).setInteractive({ useHandCursor: true });
    potion.on('pointerup', () => this.drinkPotion());
    this.potionIcon = potion;
    this.potionText = label(this, W - 160, 690, '', { size: 24, ox: 0.5 });

    // especial: círculo que enche com a energia
    this.specialBtn = this.add.container(W - 75, 640);
    this.specialRing = this.add.graphics();
    const specialName = label(this, 0, 64, this.species.special.name, { size: 16, ox: 0.5 });
    const hit = this.add.circle(0, 0, 50, 0x000000, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.useSpecial());
    this.specialBtn.add([this.specialRing, hit, specialName]);

    // cartas ganhas nesta fase
    this.cardIcons = this.add.container(24, 600);

    this.enemyBars = this.add.graphics();
    this.refreshHud();
  }

  drawSpecial() {
    const g = this.specialRing.clear();
    const ready = this.run.energy >= 100;
    g.fillStyle(0x120a06, 0.85).fillCircle(0, 0, 48);
    g.fillStyle(this.species.color, ready ? 1 : 0.35).fillCircle(0, 0, 40);
    g.lineStyle(7, ready ? 0xffd34d : this.species.color, 1);
    g.beginPath();
    g.arc(0, 0, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.run.energy / 100));
    g.strokePath();
    if (ready) g.lineStyle(2, 0xffffff, 0.8).strokeCircle(0, 0, 48);
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
    this.drawSpecial();

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
      const card = CARDS.find(c => c.id === id);
      const x = (i % 10) * 46;
      const y = -Math.floor(i / 10) * 46;
      const key = card.part ? `part_${card.part}` : `icon_${card.icon}`;
      const img = this.add.image(x + 20, y, key);
      img.setScale(Math.min(40 / img.width, 40 / img.height));
      this.cardIcons.add(img);
      if (count > 1) this.cardIcons.add(label(this, x + 34, y + 14, `${count}`, { size: 16, ox: 0.5, color: COLORS.gold }));
    });
  }

  // ---------- ciclo principal ----------

  update(_time, deltaMs) {
    if (this.run.ended) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    const s = this.stats;

    if (s.regen > 0 && s.hp > 0) s.hp = Math.min(s.maxHp, s.hp + s.regen * dt);
    if (this.run.healTime > 0) {
      this.run.healTime -= dt;
      s.hp = Math.min(s.maxHp, s.hp + this.run.healLeft * dt);
    }

    if (this.state === 'walking') this.updateWalking(dt);
    else this.updateFighting(dt);

    if (this.run.energy < 100) {
      this.run.energy = Math.min(100, this.run.energy + ENERGY_PER_SEC * s.energyMult * dt);
      this.drawSpecial();
    }
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
    // inimigos se aproximam enquanto o Encantado anda
    this.moveEnemies(dt, scroll);
    const front = this.frontEnemy();
    if (front && front.arrived) {
      this.state = 'fighting';
      if (!this.heroBusy) playIdle(this, this.hero);
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

    if (this.stats.gun > 0 && front.arrived) {
      this.run.gunTimer -= dt;
      if (this.run.gunTimer <= 0) {
        this.run.gunTimer = GUN_INTERVAL / this.stats.gun;
        this.fireGun();
      }
    }

    for (const e of this.enemies) {
      if (e.stun > 0) e.stun = Math.max(0, e.stun - dt);
    }
    if (front.arrived && !front.busy && front.stun <= 0) {
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
      const target = HERO_X + FIRST_SLOT * e.size + slot * SLOT_GAP;
      slot++;
      if (e.cr.x > target) {
        e.cr.x = Math.max(target, e.cr.x - scroll - 110 * dt);
        if (!e.walking && !e.busy) { playWalk(this, e.cr); e.walking = true; }
        e.arrived = false;
      } else if (!e.arrived) {
        e.arrived = true;
        e.walking = false;
        if (!e.busy) playIdle(this, e.cr);
      }
    }
  }

  spawnWave() {
    const list = waveEnemies(this.phase, this.run.wave, SPECIES_IDS);
    if (!list) return this.spawnBoss();
    list.forEach((species, i) => this.addEnemy(species, W + 140 + i * 200, ENEMY_SCALE, false));
    this.children.bringToTop(this.hero);
  }

  spawnBoss() {
    const others = SPECIES_IDS.filter(id => id !== this.creature.species);
    const species = others[Math.floor(Math.random() * others.length)];
    const e = this.addEnemy(species, W + 200, BOSS_SCALE, true);
    e.name = this.phase.boss.name;
    this.children.bringToTop(this.hero);
    this.announce(`${this.phase.boss.name} bloqueia a trilha!`);
  }

  addEnemy(species, x, scale, boss) {
    const def = enemyStats(species, this.run.wave, boss);
    const cr = buildCreature(this, species, x, GROUND_Y, {
      scale, flip: true, corrupted: true, parts: boss ? this.phase.boss.parts : [],
    });
    playIdle(this, cr);
    playWalk(this, cr);
    const e = {
      species, def, cr, boss, size: scale / ENEMY_SCALE, scale, name: SPECIES[species].name,
      type: SPECIES[species].type, hp: def.hp, maxHp: def.hp,
      atkTimer: def.interval * 0.6, arrived: false, walking: true, busy: false, dead: false,
      burn: 0, burnTime: 0, burnAcc: 0, stun: 0,
      xp: boss ? 0 : Math.round(9 + this.run.wave * 1.2), gold: boss ? 120 : Math.round(6 + this.run.wave * 0.7),
    };
    this.enemies.push(e);
    return e;
  }

  // ---------- combate ----------

  heroAttack(target) {
    const s = this.stats;
    this.heroBusy = true;
    this.heroAtkTimer = s.atkInterval;
    this.sound.play('swing', { volume: 0.5 });
    playAttack(this, this.hero, () => {
      this.strike(target);
      if (Math.random() < (s.doubleChance || 0)) this.time.delayedCall(160, () => this.strike(this.frontEnemy(), 1, true));
    }, () => {
      this.heroBusy = false;
      if (this.run.ended) return;
      if (this.state === 'walking') playWalk(this, this.hero);
      else playIdle(this, this.hero);
    });
  }

  // Calcula e aplica o dano de um golpe do Encantado. power multiplica o dano base.
  strike(target, power = 1, extra = false, showFx = true) {
    if (!target || target.dead || this.run.ended) return 0;
    const s = this.stats;
    const crit = Math.random() < s.crit;
    const typeMult = typeMultiplier(this.species.type, target.type);
    let dmg = Phaser.Math.FloatBetween(s.dmgMin, s.dmgMax) * s.dmgMult * power * typeMult;
    if (typeMult > 1) dmg *= 1 + s.typeBonus;
    if (crit) dmg *= s.critMult;
    dmg = Math.max(1, Math.round(dmg * (1 - target.def.defense)));

    if (showFx) {
      const fx = this.add.sprite(target.cr.x - 30, GROUND_Y - 110 * target.scale, 'slash');
      fx.setScale(crit ? 1.25 : 0.95).setAngle(extra ? 25 : -10).setTint(this.species.color).play('slash');
      fx.once('animationcomplete-slash', () => fx.destroy());
    }
    if (crit) this.cameras.main.shake(120, 0.006);
    if (typeMult !== 1 && showFx) {
      this.floatText(target.cr.x, GROUND_Y - 300 * target.scale, typeMult > 1 ? 'Vantagem!' : 'Resistente', typeMult > 1 ? '#ffb24a' : '#a8b8c8', 20, 700);
    }

    this.damageEnemy(target, dmg, crit ? 'crit' : 'normal');
    if (s.lifesteal > 0) this.healHero(dmg * s.lifesteal, false);
    if (s.burn > 0) { target.burn = Math.max(target.burn, s.burn); target.burnTime = 3; }
    this.gainEnergy(ENERGY_PER_HIT * power);
    return dmg;
  }

  damageEnemy(e, dmg, kind) {
    if (e.dead) return;
    e.hp -= dmg;
    const color = kind === 'crit' ? COLORS.gold : kind === 'burn' ? '#ff9a3c' : kind === 'blast' ? '#ff6b3c' : kind === 'gun' ? '#ffe9a0' : '#ffffff';
    const size = kind === 'crit' ? 40 : kind === 'gun' ? 20 : 28;
    this.floatText(e.cr.x - 20, GROUND_Y - 250 * e.scale, kind === 'crit' ? `${dmg}!` : `${dmg}`, color, size);

    if (kind !== 'burn') {
      playHurt(this, e.cr);
      this.sound.play('hit', { volume: kind === 'gun' ? 0.15 : 0.35, rate: Phaser.Math.FloatBetween(0.9, 1.1) });
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    e.busy = true;
    if (!e.boss) this.run.defeated.add(e.species);
    playFaint(this, e.cr, () => e.cr.destroy());

    const s = this.stats;
    const gold = Math.round(e.gold * s.goldMult);
    const xp = Math.round(e.xp * s.xpMult);
    this.run.gold += gold;
    this.run.phaseGold += gold;
    this.floatText(e.cr.x, GROUND_Y - 290 * e.scale, `+${gold} ouro`, COLORS.gold, 24, 900);

    if (s.explode > 0) {
      const next = this.enemies.find(o => !o.dead);
      if (next) this.time.delayedCall(250, () => this.damageEnemy(next, Math.round(e.maxHp * s.explode), 'blast'));
    }

    this.refreshHud();
    if (xp > 0) this.gainXp(xp);
    if (this.enemies.every(o => o.dead)) this.time.delayedCall(700, () => this.waveCleared(e.boss));
  }

  waveCleared(wasBoss) {
    if (this.run.ended) return;
    this.enemies = [];
    if (this.stats.interest > 0) {
      const bonus = Math.round(this.run.phaseGold * this.stats.interest);
      if (bonus > 0) {
        this.run.gold += bonus;
        this.floatText(HERO_X, GROUND_Y - 320, `Ninho +${bonus}`, COLORS.gold, 26, 1100);
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
    if (!this.heroBusy) playWalk(this, this.hero);
  }

  enemyAttack(e) {
    e.busy = true;
    e.atkTimer = e.def.interval;
    playAttack(this, e.cr, () => {
      if (e.dead || this.run.ended) return;
      this.hitHero(e.def.dmg * typeMultiplier(e.type, this.species.type), e);
      if (e.boss && Math.random() < 0.35) this.time.delayedCall(150, () => !e.dead && this.bossBurst(e));
    }, () => {
      if (e.dead) return;
      e.busy = false;
      playIdle(this, e.cr);
    });
  }

  // O chefe também tem pata metralhadora.
  bossBurst(e) {
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 110, () => {
        if (e.dead || this.run.ended) return;
        const from = muzzlePoint(e.cr);
        this.bullet(from.x, from.y, HERO_X + 20, GROUND_Y - 90, () => this.hitHero(e.def.dmg * 0.25, null, true));
      });
    }
  }

  hitHero(raw, attacker, small = false) {
    const s = this.stats;
    const dmg = Math.max(1, Math.round(raw * (1 - s.defense)));
    s.hp -= dmg;
    this.floatText(HERO_X - 10, GROUND_Y - 210, `-${dmg}`, COLORS.red, small ? 22 : 30);
    if (!small) this.sound.play('hero_hurt', { volume: 0.3 });
    playHurt(this, this.hero);
    if (attacker && s.thorns > 0) this.damageEnemy(attacker, Math.max(1, Math.round(dmg * s.thorns)), 'blast');
    if (s.hp <= 0) {
      s.hp = 0;
      this.endRun(false);
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
    if (show && s.hp > before) this.floatText(HERO_X - 10, GROUND_Y - 210, `+${Math.round(s.hp - before)}`, COLORS.green, 30);
  }

  drinkPotion() {
    const s = this.stats;
    if (this.run.ended || s.potions <= 0 || s.hp >= s.maxHp) return;
    s.potions--;
    this.healHero(s.maxHp * POTION_HEAL);
    this.refreshHud();
  }

  // ---------- especial e peças ----------

  gainEnergy(amount) {
    const was = this.run.energy;
    this.run.energy = Math.min(100, this.run.energy + amount * this.stats.energyMult);
    if (was < 100 && this.run.energy >= 100) {
      this.tweens.add({ targets: this.specialBtn, scale: 1.15, duration: 140, yoyo: true });
    }
    this.drawSpecial();
  }

  useSpecial() {
    if (this.run.ended || this.run.energy < 100 || this.state !== 'fighting') return;
    this.run.energy = 0;
    this.drawSpecial();
    this.castSpecial();
    if (this.stats.specialTwice) this.time.delayedCall(450, () => this.castSpecial());
  }

  castSpecial() {
    const target = this.frontEnemy();
    const id = this.creature.species;
    this.announce(this.species.special.name, 900);
    this.sound.play('level_up', { volume: 0.35, rate: 1.4 });
    if (id === 'capinho') {
      this.run.healLeft = this.stats.maxHp * 0.35 / 5;
      this.run.healTime = 5;
      this.sparkle(HERO_X, GROUND_Y - 100, 0x7fe06a);
      return;
    }
    if (!target) return;
    playAttack(this, this.hero, () => {
      if (id === 'brasinho') {
        this.strike(target, 2.2);
        if (!target.dead) { target.burn = Math.max(target.burn, 6); target.burnTime = 4; }
        this.sparkle(target.cr.x, GROUND_Y - 90, 0xff8a1f);
      } else if (id === 'botinho') {
        this.strike(target, 1.2);
        if (!target.dead) this.bubble(target, 2.5);
      }
    });
  }

  fireGun() {
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 120, () => {
        const target = this.frontEnemy();
        if (!target || this.run.ended || !this.hero.partImages.pata_metralhadora) return;
        const from = muzzlePoint(this.hero);
        this.bullet(from.x, from.y, target.cr.x - 30, GROUND_Y - 90 * target.scale, () => {
          if (target.dead) return;
          const dmg = Math.max(1, Math.round((this.stats.dmgMin + this.stats.dmgMax) / 2 * 0.3 * this.stats.dmgMult));
          this.damageEnemy(target, dmg, 'gun');
        });
      });
    }
  }

  bullet(x1, y1, x2, y2, onHit) {
    const b = this.add.rectangle(x1, y1, 16, 4, 0xffe27a).setRotation(Math.atan2(y2 - y1, x2 - x1));
    const flash = this.add.circle(x1, y1, 9, 0xfff2c0, 0.9);
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.6, duration: 90, onComplete: () => flash.destroy() });
    this.tweens.add({ targets: b, x: x2, y: y2, duration: 130, onComplete: () => { b.destroy(); onHit(); } });
  }

  bubble(e, seconds) {
    e.stun = seconds;
    const r = 120 * e.scale;
    const ring = this.add.circle(e.cr.x, GROUND_Y - r * 0.9, r, 0x7fd4ff, 0.22).setStrokeStyle(4, 0xbfeaff, 0.9);
    this.tweens.add({ targets: ring, scale: { from: 0.4, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: ring, alpha: 0, delay: seconds * 1000 - 300, duration: 300, onComplete: () => ring.destroy() });
  }

  sparkle(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const p = this.add.circle(x + Phaser.Math.Between(-60, 60), y + Phaser.Math.Between(-40, 40), Phaser.Math.Between(4, 9), color, 0.9);
      this.tweens.add({ targets: p, y: p.y - Phaser.Math.Between(50, 120), alpha: 0, duration: Phaser.Math.Between(500, 900), onComplete: () => p.destroy() });
    }
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
    const taken = CARDS.filter(c => c.unique && this.run.cards[c.id]).map(c => c.id);
    this.scene.launch('LevelUp', {
      level: this.run.level - this.run.pendingLevels + 1,
      cards: rollCards(3, this.stats.luck, taken),
      onPick: card => {
        card.apply(this.stats);
        if (card.part) addPart(this, this.hero, card.part);
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
    if (!won) playFaint(this, this.hero, () => {});
    else playIdle(this, this.hero);
    this.music.stop();
    this.time.delayedCall(1300, () => {
      this.scene.start('Result', {
        won,
        wave: this.run.wave,
        totalWaves: this.phase.waves + 1,
        level: this.run.level,
        gold: this.run.gold,
        phaseName: this.phase.name,
        defeated: [...this.run.defeated],
      });
    });
  }

  // ---------- efeitos visuais ----------

  floatText(x, y, text, color, size = 28, duration = 750) {
    const t = label(this, x + Phaser.Math.Between(-12, 12), y, text, { size, color, ox: 0.5, strokeThickness: 5 });
    this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  announce(text, hold = 1800) {
    const t = label(this, W / 2, 200, text, { size: 34, ox: 0.5, color: COLORS.gold, strokeThickness: 6 });
    this.tweens.add({ targets: t, alpha: 0, delay: hold, duration: 600, onComplete: () => t.destroy() });
  }

  drawEnemyBars() {
    const g = this.enemyBars.clear();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const w = e.boss ? 180 : 90;
      const x = e.cr.x - w / 2;
      const y = GROUND_Y - 240 * e.scale - 14;
      g.fillStyle(0x120a06, 0.85).fillRect(x - 2, y - 2, w + 4, 12);
      g.fillStyle(e.burnTime > 0 ? 0xff8a2a : e.stun > 0 ? 0x5ab8ff : 0xd2382c, 1).fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 8);
    }
  }
}
