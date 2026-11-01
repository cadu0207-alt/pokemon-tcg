// Números do jogo. Ajuste aqui para balancear.

export const HERO_BASE = {
  maxHp: 120,
  dmgMin: 7,
  dmgMax: 11,
  atkInterval: 0.85, // segundos entre ataques
  crit: 0.08,
  critMult: 2,
  armor: 0,
  potions: 2,
};

export const POTION_HEAL = 0.4; // fração da vida máxima
export const WAVE_HEAL = 0.08; // cura entre ondas, fração da vida máxima

export function xpToLevel(level) {
  return Math.round(20 * Math.pow(1.28, level - 1));
}

// Inimigos. Vida e dano crescem a cada onda (ver scaleEnemy).
export const ENEMIES = {
  knight_bronze: { name: 'Escudeiro', hp: 28, dmg: 4, interval: 1.0, xp: 9, gold: 6 },
  orc1: { name: 'Orc da Marreta', hp: 34, dmg: 5, interval: 1.3, xp: 10, gold: 7 },
  knight_silver: { name: 'Cavaleiro de Prata', hp: 40, dmg: 6, interval: 1.1, xp: 12, gold: 8 },
  orc2: { name: 'Orc Espadachim', hp: 46, dmg: 7, interval: 1.4, xp: 13, gold: 9 },
  orc3: { name: 'Orc do Machado', hp: 60, dmg: 8, interval: 1.5, xp: 16, gold: 12 },
  knight_black: { name: 'Cavaleiro Negro', hp: 480, dmg: 13, interval: 1.2, xp: 0, gold: 120, scale: 1.45, boss: true },
};

export function scaleEnemy(def, wave) {
  return {
    ...def,
    hp: Math.round(def.hp * (1 + 0.12 * wave)),
    dmg: Math.round(def.dmg * (1 + 0.05 * wave)),
  };
}

export const PHASES = [
  {
    name: 'Floresta de Whitewood',
    bg: 'whitewood',
    waves: 10,
    pool: ['knight_bronze', 'orc1', 'knight_silver', 'orc2', 'orc3'],
    boss: 'knight_black',
  },
];

// Monta a lista de inimigos de uma onda (wave começa em 0).
export function waveEnemies(phase, wave) {
  if (wave >= phase.waves) return [phase.boss];
  const count = Math.min(3, 1 + Math.floor(wave / 3));
  const maxTier = Math.min(phase.pool.length - 1, Math.floor(wave / 2));
  return Array.from({ length: count }, () => phase.pool[Math.floor(Math.random() * (maxTier + 1))]);
}

export const RARITY = {
  common: { label: 'Comum', weight: 60, color: '#d9b48a' },
  rare: { label: 'Raro', weight: 28, color: '#7fdc7f' },
  epic: { label: 'Épico', weight: 10, color: '#c08cff' },
  legendary: { label: 'Lendário', weight: 2, color: '#ffd34d' },
};

// Cartas que aparecem ao subir de nível durante a fase.
export const CARDS = [
  { id: 'sharp_blade', name: 'Lâmina Afiada', rarity: 'common', desc: '+20% de dano', apply: s => { s.dmgMult += 0.2; } },
  { id: 'iron_skin', name: 'Pele de Ferro', rarity: 'common', desc: '+25 de vida máxima e cura 25', apply: s => { s.maxHp += 25; s.hp += 25; } },
  { id: 'greed', name: 'Ganância', rarity: 'common', desc: '+25% de ouro ganho', apply: s => { s.goldMult += 0.25; } },
  { id: 'scholar', name: 'Estudioso', rarity: 'common', desc: '+25% de XP ganho', apply: s => { s.xpMult += 0.25; } },
  { id: 'haste', name: 'Passos Ligeiros', rarity: 'common', desc: 'Ataca 12% mais rápido', apply: s => { s.atkInterval *= 0.88; } },
  { id: 'potion', name: 'Frasco Extra', rarity: 'common', desc: '+1 poção de cura', apply: s => { s.potions += 1; } },
  { id: 'keen_eye', name: 'Olho Afiado', rarity: 'rare', desc: '+8% de chance de crítico', apply: s => { s.crit += 0.08; } },
  { id: 'brutal', name: 'Golpe Brutal', rarity: 'rare', desc: '+50% de dano crítico', apply: s => { s.critMult += 0.5; } },
  { id: 'vampire', name: 'Sede de Sangue', rarity: 'rare', desc: 'Recupera 6% do dano que causa', apply: s => { s.lifesteal += 0.06; } },
  { id: 'shield', name: 'Égide', rarity: 'rare', desc: 'Cada golpe recebido causa 2 a menos de dano', apply: s => { s.armor += 2; } },
  { id: 'interest', name: 'Juros', rarity: 'rare', desc: 'Ao vencer uma onda, ganha 10% do ouro da fase', apply: s => { s.interest += 0.1; } },
  { id: 'burn', name: 'Lâmina Flamejante', rarity: 'epic', desc: 'Golpes queimam: 4 de dano por segundo durante 3 s', apply: s => { s.burn += 4; } },
  { id: 'double', name: 'Corte Duplo', rarity: 'epic', desc: '20% de chance de golpear duas vezes', apply: s => { s.doubleChance += 0.2; } },
  { id: 'explode', name: 'Marca da Ruína', rarity: 'epic', desc: 'Inimigos derrotados explodem: 30% da vida deles no próximo', apply: s => { s.explode += 0.3; } },
  { id: 'berserk', name: 'Fúria Berserker', rarity: 'legendary', desc: '+60% de dano, mas −20% de vida máxima', apply: s => { s.dmgMult += 0.6; s.maxHp = Math.round(s.maxHp * 0.8); s.hp = Math.min(s.hp, s.maxHp); } },
  { id: 'blessing', name: 'Bênção da Floresta', rarity: 'legendary', desc: 'Regenera 3 de vida por segundo', apply: s => { s.regen += 3; } },
];

// Sorteia n cartas diferentes. A sorte aumenta a chance das raras.
export function rollCards(n, luck = 0) {
  const weights = {
    common: RARITY.common.weight,
    rare: RARITY.rare.weight * (1 + luck * 3),
    epic: RARITY.epic.weight * (1 + luck * 5),
    legendary: RARITY.legendary.weight * (1 + luck * 8),
  };
  const picked = [];
  while (picked.length < n) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let rarity = 'common';
    for (const [k, w] of Object.entries(weights)) {
      if ((r -= w) <= 0) { rarity = k; break; }
    }
    const options = CARDS.filter(c => c.rarity === rarity && !picked.includes(c));
    if (options.length) picked.push(options[Math.floor(Math.random() * options.length)]);
  }
  return picked;
}

// Melhorias permanentes compradas com ouro no acampamento.
export const UPGRADES = [
  { id: 'strength', name: 'Força', icon: 'upgrade_strength', max: 10, baseCost: 15, growth: 1.6, desc: l => `+${1.5 * l} de dano em cada golpe` },
  { id: 'vitality', name: 'Vitalidade', icon: 'upgrade_vitality', max: 10, baseCost: 15, growth: 1.6, desc: l => `+${15 * l} de vida máxima` },
  { id: 'potions', name: 'Alquimia', icon: 'upgrade_potions', max: 3, baseCost: 40, growth: 2, desc: l => `+${l} poção por fase` },
  { id: 'luck', name: 'Sorte', icon: 'upgrade_luck', max: 8, baseCost: 25, growth: 1.7, desc: l => `+${2 * l}% de crítico e cartas melhores` },
];

export function upgradeCost(upgrade, level) {
  return Math.round(upgrade.baseCost * Math.pow(upgrade.growth, level));
}

export const CREDITS = [
  ['Personagens (guerreira, orcs, cavaleiros)', 'CraftPix.net'],
  ['Cenário Whitewood Vale', 'Frostwindz'],
  ['Ícones de magia "Painterly Spell Icons"', 'J. W. Bjerk (eleazzaar), CC BY 3.0'],
  ['Ícones de habilidades', 'CraftPix.net, OGA-BY 3.0'],
  ['Ícones de itens', 'Drummyfish (CC0)'],
  ['Molduras das cartas "TCG Templates"', 'KillGorack (CC0)'],
  ['Barras "2D Bars"', 'Dakal, CC BY 3.0'],
  ['Interface "RPG GUI construction kit"', 'Lamoot, CC BY 3.0'],
  ['Efeito de corte "Weapon Slash"', 'Cethiel (CC0)'],
  ['Sons', 'artisticdude, rubberduck, HaelDB, JaggedStone (CC0)'],
  ['Música "Battle Theme A"', 'cynicmusic (CC0)'],
  ['Música "The Old Tower Inn"', 'RandomMind (CC0)'],
  ['Todos via OpenGameArt.org e itch.io', ''],
];
