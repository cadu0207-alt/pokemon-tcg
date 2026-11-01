// Números do jogo. Ajuste aqui para balancear.

export const GARRAFADAS = 2; // garrafadas de cura por fase
export const POTION_HEAL = 0.4; // fração da vida máxima
export const WAVE_HEAL = 0.08; // cura entre ondas, fração da vida máxima
export const ENERGY_PER_HIT = 14; // energia do especial ganha a cada golpe (100 enche)
export const ENERGY_PER_SEC = 4;

export function xpToLevel(level) {
  return Math.round(20 * Math.pow(1.28, level - 1));
}

export const PHASES = [
  {
    name: 'Sudeste · Trilha da Serra',
    bg: 'whitewood',
    waves: 10,
    boss: { name: 'Espécime 07 do Consórcio', parts: ['pata_mecanica', 'pata_metralhadora', 'olho_rubro'] },
  },
];

// Monta a lista de espécies de uma onda (wave começa em 0). null = onda do chefe.
export function waveEnemies(phase, wave, species) {
  if (wave >= phase.waves) return null;
  const count = Math.min(3, 1 + Math.floor(wave / 3));
  return Array.from({ length: count }, () => species[Math.floor(Math.random() * species.length)]);
}

export const RARITY = {
  common: { label: 'Comum', weight: 55, color: '#c9ced3' },
  uncommon: { label: 'Incomum', weight: 26, color: '#7fdc7f' },
  rare: { label: 'Raro', weight: 13, color: '#6fb6ff' },
  epic: { label: 'Épico', weight: 5, color: '#c08cff' },
  legendary: { label: 'Lendário', weight: 1.2, color: '#ffd34d' },
};

// Cartas que aparecem ao subir de nível. Valem só até o fim da fase.
// part: peça que aparece no corpo do Encantado (mutação da terra ou enxerto do Consórcio).
// unique: não volta a ser oferecida depois de escolhida.
export const CARDS = [
  { id: 'garras', icon: 'sharp_blade', name: 'Garras Afiadas', rarity: 'common', desc: '+15% de dano', apply: s => { s.dmgMult += 0.15; } },
  { id: 'couro', icon: 'iron_skin', name: 'Couro Grosso', rarity: 'common', desc: '+15% de vida máxima e cura o mesmo', apply: s => { const v = Math.round(s.maxHp * 0.15); s.maxHp += v; s.hp += v; } },
  { id: 'faro', icon: 'greed', name: 'Faro de Ouro', rarity: 'common', desc: '+20% de ouro ganho', apply: s => { s.goldMult += 0.2; } },
  { id: 'curiosidade', icon: 'scholar', name: 'Curiosidade', rarity: 'common', desc: '+20% de XP ganho', apply: s => { s.xpMult += 0.2; } },
  { id: 'passo', icon: 'haste', name: 'Passo Ligeiro', rarity: 'common', desc: 'Ataca 12% mais rápido', apply: s => { s.atkInterval *= 0.88; } },
  { id: 'garrafada', icon: 'potion', name: 'Garrafada', rarity: 'common', desc: '+1 garrafada de cura', apply: s => { s.potions += 1; } },
  { id: 'olho_vivo', icon: 'keen_eye', name: 'Olho Vivo', rarity: 'uncommon', desc: '+6% de chance de crítico', apply: s => { s.crit += 0.06; } },
  { id: 'energia', icon: 'blessing', name: 'Energia Rápida', rarity: 'uncommon', desc: 'O especial carrega 25% mais rápido', apply: s => { s.energyMult += 0.25; } },
  { id: 'ninho', icon: 'interest', name: 'Ninho Cheio', rarity: 'uncommon', desc: 'Ao vencer uma onda, ganha 8% do ouro da fase', apply: s => { s.interest += 0.08; } },
  { id: 'espinhos', part: 'espinhos', unique: true, kind: 'Mutação', name: 'Espinhos de Osso', rarity: 'uncommon', desc: 'Devolve 25% do dano recebido', apply: s => { s.thorns += 0.25; } },
  { id: 'olho_rubro', part: 'olho_rubro', unique: true, kind: 'Enxerto', name: 'Olho Rubro', rarity: 'rare', desc: '+10% de crítico e +40% de dano crítico', apply: s => { s.crit += 0.1; s.critMult += 0.4; } },
  { id: 'pata_mecanica', part: 'pata_mecanica', unique: true, kind: 'Enxerto', name: 'Pata Mecânica', rarity: 'rare', desc: 'Ataca 20% mais rápido e absorve +10% do dano', apply: s => { s.atkInterval *= 0.8; s.defense = Math.min(0.75, s.defense + 0.1); } },
  { id: 'vampira', icon: 'vampire', name: 'Mordida Vampira', rarity: 'rare', desc: 'Recupera 8% do dano causado', apply: s => { s.lifesteal += 0.08; } },
  { id: 'brasa', icon: 'burn', name: 'Brasa Viva', rarity: 'rare', desc: 'Golpes queimam: 4 de dano por segundo durante 3 s', apply: s => { s.burn += 4; } },
  { id: 'pata_metralhadora', part: 'pata_metralhadora', unique: true, kind: 'Enxerto', name: 'Pata Metralhadora', rarity: 'epic', desc: 'Dispara uma rajada de 3 tiros a cada 2 s', apply: s => { s.gun += 1; } },
  { id: 'sintonia', icon: 'brutal', name: 'Sintonia de Tipo', rarity: 'epic', desc: '+40% de dano quando há vantagem de tipo', apply: s => { s.typeBonus += 0.4; } },
  { id: 'explosao', icon: 'explode', name: 'Explosão Final', rarity: 'epic', desc: 'Inimigos derrotados explodem: 30% da vida deles no próximo', apply: s => { s.explode += 0.3; } },
  { id: 'bencao', icon: 'double', name: 'Bênção de Pindorama', rarity: 'legendary', desc: '+25% de dano, vida e velocidade', apply: s => { s.dmgMult += 0.25; const v = Math.round(s.maxHp * 0.25); s.maxHp += v; s.hp += v; s.atkInterval *= 0.8; } },
  { id: 'despertar', icon: 'berserk', name: 'Despertar', rarity: 'legendary', unique: true, desc: 'O especial é usado duas vezes seguidas', apply: s => { s.specialTwice = true; } },
];

// Sorteia n cartas diferentes. A sorte aumenta a chance das raras. exclude: ids que não podem sair.
export function rollCards(n, luck = 0, exclude = []) {
  const weights = {
    common: RARITY.common.weight,
    uncommon: RARITY.uncommon.weight * (1 + luck * 2),
    rare: RARITY.rare.weight * (1 + luck * 3),
    epic: RARITY.epic.weight * (1 + luck * 5),
    legendary: RARITY.legendary.weight * (1 + luck * 8),
  };
  const picked = [];
  while (picked.length < n) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    let rarity = 'common';
    for (const [k, w] of Object.entries(weights)) {
      if ((r -= w) <= 0) { rarity = k; break; }
    }
    const options = CARDS.filter(c => c.rarity === rarity && !picked.includes(c) && !exclude.includes(c.id));
    if (!options.length) { weights[rarity] = 0; continue; }
    picked.push(options[Math.floor(Math.random() * options.length)]);
  }
  return picked;
}

// Melhorias permanentes compradas com ouro no Santuário. Valem para todos os Encantados.
export const UPGRADES = [
  { id: 'strength', name: 'Treino de Força', icon: 'upgrade_strength', max: 10, baseCost: 15, growth: 1.6, desc: l => `+${6 * l}% de dano` },
  { id: 'vitality', name: 'Treino de Fôlego', icon: 'upgrade_vitality', max: 10, baseCost: 15, growth: 1.6, desc: l => `+${6 * l}% de vida máxima` },
  { id: 'potions', name: 'Benzedura', icon: 'upgrade_potions', max: 3, baseCost: 40, growth: 2, desc: l => `+${l} garrafada por fase` },
  { id: 'luck', name: 'Sorte', icon: 'upgrade_luck', max: 8, baseCost: 25, growth: 1.7, desc: l => `+${2 * l}% de crítico e cartas melhores` },
];

export function upgradeCost(upgrade, level) {
  return Math.round(upgrade.baseCost * Math.pow(upgrade.growth, level));
}

export const SANCTUARY_SLOTS = 12;
export const CAPTURE_CHANCE = { C: 0.6, I: 0.45, R: 0.35, E: 0.15, L: 0.05 };

export const CREDITS = [
  ['Encantados e peças (Brasinho, Botinho, Capinho)', 'Arte original do projeto'],
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
