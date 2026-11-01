import { GARRAFADAS } from './data.js';
import { combatStats, creatureAttributes } from './creatures.js';

const KEY = 'rpgbd-save-v1';

// Mesmo projeto Supabase do MyDeck: no domínio mydecktcg.com.br o jogo usa o login do site.
const SUPABASE_URL = 'https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_f4d1JHAzTWPWYAI0Vm6aRA_NwM-uzr3';

const DEFAULT_SAVE = {
  gold: 0,
  upgrades: { strength: 0, vitality: 0, potions: 0, luck: 0 },
  bestWave: 0,
  wins: 0,
  creatures: [], // Encantados do Santuário (ver rollCreature)
  active: 0, // índice do Encantado que vai para a expedição
  savedAt: 0,
};

let cloud = null; // { client, userId, email } quando há login no MyDeck

function normalize(data) {
  return { ...DEFAULT_SAVE, ...data, upgrades: { ...DEFAULT_SAVE.upgrades, ...data?.upgrades } };
}

function writeLocal(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignora */ }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* sem armazenamento: começa do zero */ }
  return structuredClone(DEFAULT_SAVE);
}

export function writeSave(save) {
  save.savedAt = Date.now();
  writeLocal(save);
  if (!cloud) return;
  cloud.client.from('rpg_saves')
    .upsert({ user_id: cloud.userId, data: save, updated_at: new Date().toISOString() })
    .then(({ error }) => { if (error) console.warn('Falha ao salvar na nuvem', error.message); });
}

// Liga o salvamento na nuvem se houver sessão do MyDeck. Fica com o progresso mais recente
// entre o do navegador e o da nuvem. Devolve o e-mail da conta, ou null sem login.
export async function initCloud() {
  try {
    if (!window.supabase) return null;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    cloud = { client, userId: session.user.id, email: session.user.email };

    const { data, error } = await client.from('rpg_saves').select('data').eq('user_id', cloud.userId).maybeSingle();
    if (error) throw error;
    const local = loadSave();
    const remote = data ? normalize(data.data) : null;
    if (remote && remote.savedAt > local.savedAt) writeLocal(remote);
    else if (local.savedAt > 0) writeSave(local);
    return cloud.email;
  } catch (e) {
    console.warn('Salvamento na nuvem indisponível', e);
    cloud = null;
    return null;
  }
}

// Números de combate do Encantado ativo no início de uma fase, já com as melhorias do Santuário.
export function creatureStatsFromSave(save, creature = save.creatures[save.active]) {
  const u = save.upgrades;
  const c = combatStats(creatureAttributes(creature));
  const maxHp = Math.round(c.maxHp * (1 + 0.06 * u.vitality));
  const dmgMult = 1 + 0.06 * u.strength;
  return {
    maxHp,
    hp: maxHp,
    dmgMin: c.dmgMin * dmgMult,
    dmgMax: c.dmgMax * dmgMult,
    dmgMult: 1,
    atkInterval: c.atkInterval,
    defense: c.defense,
    crit: 0.08 + 0.02 * u.luck,
    critMult: 2,
    potions: GARRAFADAS + u.potions,
    luck: 0.05 * u.luck,
    lifesteal: 0,
    burn: 0,
    explode: 0,
    regen: 0,
    goldMult: 1,
    xpMult: 1,
    interest: 0,
    energyMult: 1,
    thorns: 0,
    gun: 0,
    typeBonus: 0,
    specialTwice: false,
  };
}
