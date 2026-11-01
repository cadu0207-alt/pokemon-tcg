import { HERO_BASE } from './data.js';

const KEY = 'rpgbd-save-v1';

const DEFAULT_SAVE = {
  gold: 0,
  upgrades: { strength: 0, vitality: 0, potions: 0, luck: 0 },
  bestWave: 0,
  wins: 0,
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return { ...DEFAULT_SAVE, ...data, upgrades: { ...DEFAULT_SAVE.upgrades, ...data.upgrades } };
    }
  } catch (e) { /* sem armazenamento: começa do zero */ }
  return structuredClone(DEFAULT_SAVE);
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignora */ }
}

// Atributos do herói no início de uma fase, já com as melhorias do acampamento.
export function heroStatsFromSave(save) {
  const u = save.upgrades;
  const maxHp = HERO_BASE.maxHp + 15 * u.vitality;
  return {
    maxHp,
    hp: maxHp,
    dmgMin: HERO_BASE.dmgMin + 1.5 * u.strength,
    dmgMax: HERO_BASE.dmgMax + 1.5 * u.strength,
    dmgMult: 1,
    atkInterval: HERO_BASE.atkInterval,
    crit: HERO_BASE.crit + 0.02 * u.luck,
    critMult: HERO_BASE.critMult,
    armor: HERO_BASE.armor,
    potions: HERO_BASE.potions + u.potions,
    luck: 0.05 * u.luck,
    lifesteal: 0,
    burn: 0,
    doubleChance: 0,
    explode: 0,
    regen: 0,
    goldMult: 1,
    xpMult: 1,
    interest: 0,
  };
}
