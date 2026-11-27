// ================================================================
// MyDeck — Pokémon Escondidos: MODO SOLO (versão de teste, 27/11/2026)
// ================================================================
// Fase "Kanto": mapa com 8 cidades de ginásio e a 9ª, Kanto, com o campeonato. Nesta versão só a primeira cidade
// abre: trilha de 10 combates e o ginásio. Cada Pokémon luta com poderes do(s) seu(s) tipo(s) (3 por tipo: fraco,
// médio e forte) e os atributos da mochila valem na força.
//
// É um PROTÓTIPO: roda só no navegador, guarda o progresso no aparelho e NÃO dá bola, XP nem prêmio (por isso pode
// ficar no navegador; quando houver prêmio, o servidor terá de conferir cada turno). Aberto a todos desde 27/11/2026,
// ainda marcado como teste. Quem não quiser ver o botão neste aparelho abre o site com ?solo=0 (?solo=1 traz de volta).
//
// As regras (parte de cima) também rodam no Node, para calibrar e testar: require('./wild_solo.js').
// ================================================================
(function () {
  'use strict';

  // ── Tipos (os 15 da primeira geração) ─────────────────────────
  const TYPES = {
    n: { name: 'Normal', color: '#a8a77a', moves: ['Tapa', 'Investida', 'Fúria Total'] },
    f: { name: 'Fogo', color: '#ee8130', moves: ['Faísca', 'Labareda', 'Incêndio'] },
    w: { name: 'Água', color: '#6390f0', moves: ['Respingo', 'Jato', 'Maré Cheia'] },
    e: { name: 'Elétrico', color: '#f7d02c', moves: ['Estalo', 'Descarga', 'Tempestade'] },
    g: { name: 'Planta', color: '#7ac74c', moves: ['Folha Cortante', 'Chuva de Folhas', 'Floresta Viva'] },
    i: { name: 'Gelo', color: '#96d9d6', moves: ['Geada', 'Estaca de Gelo', 'Nevasca'] },
    l: { name: 'Lutador', color: '#c22e28', moves: ['Soco Ligeiro', 'Golpe Duplo', 'Punho de Ferro'] },
    p: { name: 'Veneno', color: '#a33ea1', moves: ['Picada', 'Névoa Tóxica', 'Maré Venenosa'] },
    t: { name: 'Terra', color: '#e2bf65', moves: ['Punhado de Areia', 'Tremor', 'Fenda'] },
    v: { name: 'Voador', color: '#a98ff3', moves: ['Bicada', 'Rajada', 'Ciclone'] },
    y: { name: 'Psíquico', color: '#f95587', moves: ['Pulso Mental', 'Onda Mental', 'Colapso Mental'] },
    b: { name: 'Inseto', color: '#a6b91a', moves: ['Mordiscada', 'Enxame', 'Praga'] },
    r: { name: 'Pedra', color: '#b6a136', moves: ['Pedregulho', 'Deslizamento', 'Avalanche'] },
    h: { name: 'Fantasma', color: '#735797', moves: ['Arrepio', 'Sombra', 'Pesadelo'] },
    d: { name: 'Dragão', color: '#6f35fc', moves: ['Sopro', 'Garra Antiga', 'Fúria do Dragão'] },
  };
  // posição = número na Pokédex - 1
  const MON_TYPES = ('gp gp gp f f fv w w w b b bv bp bp bp nv nv nv n n nv nv p p e e t t p p pt p p pt n n f f n n pv pv gp gp gp bg bg bp bp ' +
    't t n n w w l l f f w w wl y y y l l l gp gp gp wp wp rt rt rt f f wy wy e e nv nv nv w wi p p w wi hp hp hp rt y y w w e e gy gy t t l l n p p tr tr n g n w w w w w wy y bv iy e f b n w wv wi n n w e f n rw rw rw rw rv n iv ev fv d d dv y y').split(' ');
  // vantagem (strong) e desvantagem (weak) de cada tipo de golpe contra os tipos do alvo
  const CHART = {
    n: ['', 'rh'], f: ['gib', 'fwrd'], w: ['ftr', 'wgd'], e: ['wv', 'egdt'], g: ['wtr', 'fgpvbd'], i: ['gtvd', 'wif'],
    l: ['nir', 'pvybh'], p: ['g', 'ptrh'], t: ['fepr', 'gbv'], v: ['glb', 'er'], y: ['lp', 'y'], b: ['gy', 'flpvh'],
    r: ['fivb', 'lt'], h: ['hy', 'n'], d: ['d', ''],
  };

  // ── Números do combate (ajuste aqui para calibrar) ────────────
  const RULES = {
    power: [20, 32, 55], cost: [0, 1, 3], maxEnergy: 5, startEnergy: 1,
    advantage: 1.25, disadvantage: 0.8, defend: 0.5, spread: 0.15, critMult: 1.5,
    heal: 0.2, // quem derruba um rival recupera 20% da vida
  };
  const STARTERS = [1, 4, 7];
  const STARTER_STAT = 60; // igual para todos: ninguém precisa ficar refazendo até sair um bom

  // ── Primeira cidade: 10 combates e o ginásio ──────────────────
  const stage = (level, dexes) => dexes.map(dex => ({ dex, level }));
  // Combates 1 a 4: um rival (dá pra passar só com o inicial). Depois vêm dois e três: hora de levar capturas.
  const CITY1 = [
    stage(38, [16]), stage(42, [19]), stage(45, [10]), stage(46, [21]), stage(46, [13, 41]),
    stage(48, [32, 29]), stage(50, [27, 56]), stage(49, [74, 17, 46]), stage(51, [35, 74, 41]), stage(53, [27, 50, 74]),
  ];
  const GYM1 = [{ dex: 74, level: 54 }, { dex: 75, level: 56 }, { dex: 95, level: 59 }];
  // posições do nosso mapa (desenho próprio): o caminho serpenteia na ordem em que as cidades vão abrir
  const CITIES = [
    { name: 'Pewter', gym: 'r', x: 58, y: 66 }, { name: 'Cerulean', gym: 'w', x: 150, y: 48 },
    { name: 'Vermilion', gym: 'e', x: 242, y: 70 }, { name: 'Celadon', gym: 'g', x: 236, y: 140 },
    { name: 'Fuchsia', gym: 'p', x: 148, y: 128 }, { name: 'Saffron', gym: 'y', x: 62, y: 152 },
    { name: 'Cinnabar', gym: 'f', x: 56, y: 262 }, { name: 'Viridian', gym: 't', x: 150, y: 214 },
    { name: 'Kanto', gym: null, x: 238, y: 218 },
  ];

  const typesOf = dex => MON_TYPES[dex - 1].split('');
  function multiplier(moveType, targetTypes) {
    const [strong, weak] = CHART[moveType];
    const score = targetTypes.reduce((s, t) => s + (strong.includes(t) ? 1 : 0) - (weak.includes(t) ? 1 : 0), 0);
    return score > 0 ? RULES.advantage : score < 0 ? RULES.disadvantage : 1;
  }
  // Cada espaço (fraco, médio, forte) usa um dos tipos do Pokémon; sem escolha, alterna começando pelo primeiro.
  function defaultSlots(dex) {
    const t = typesOf(dex);
    return [t[0], t[1] || t[0], t[0]];
  }
  const flatStats = v => ({ hp: v, atk: v, def: v, spd: v, crit: v });
  function makeFighter(dex, stats, extra) {
    const maxHp = Math.round(100 + stats.hp * 0.8);
    return Object.assign({ dex, types: typesOf(dex), stats: { hp: stats.hp, atk: stats.atk, def: stats.def, spd: stats.spd, crit: stats.crit }, slots: defaultSlots(dex), maxHp, hp: maxHp, energy: RULES.startEnergy }, extra);
  }
  const rivalsOf = list => list.map(r => makeFighter(r.dex, flatStats(r.level)));

  function createBattle(team, foes, smart) {
    return { team, foes, p: 0, f: 0, winner: null, rounds: 0, smart: smart || 0 };
  }
  const active = (b, side) => (side === 'p' ? b.team[b.p] : b.foes[b.f]);

  function computeDamage(attacker, target, slot, rng) {
    const type = attacker.slots[slot];
    const mult = multiplier(type, target.types);
    const crit = rng() < attacker.stats.crit / 400;
    const dmg = RULES.power[slot] * (0.75 + attacker.stats.atk / 200) * (1 - (target.stats.def - 50) / 300) *
      mult * (1 - RULES.spread + rng() * RULES.spread * 2) * (crit ? RULES.critMult : 1);
    return { type, mult, crit, dmg: Math.max(1, Math.round(dmg)) };
  }

  // Escolha do rival: guarda energia para o golpe forte; quanto mais "esperto", mais se defende na hora certa.
  function rivalChoose(b, rng) {
    const me = active(b, 'f'), you = active(b, 'p');
    if (you.energy >= RULES.cost[2] && rng() < 0.1 + b.smart * 0.25) return { type: 'defend' };
    const can = [0, 1, 2].filter(s => me.energy >= RULES.cost[s]);
    const value = s => RULES.power[s] * multiplier(me.slots[s], you.types);
    if (can.includes(2) && rng() < 0.75) return { type: 'move', slot: 2 };
    if (can.includes(1) && rng() < 0.3 + b.smart * 0.2 && value(1) > value(0)) return { type: 'move', slot: 1 };
    return { type: 'move', slot: 0 };
  }

  // Uma rodada: os dois escolhem, quem se defende levanta o escudo primeiro, a Agilidade pesa em quem bate antes.
  function playRound(b, action, rng) {
    rng = rng || Math.random;
    if (b.winner) return [];
    const you = active(b, 'p');
    if (action.type === 'move' && you.energy < RULES.cost[action.slot]) return [];
    const picks = { p: action, f: rivalChoose(b, rng) };
    const events = [];
    const guard = {};
    b.rounds++;
    for (const side of ['p', 'f']) if (picks[side].type === 'defend') { guard[side] = true; events.push({ kind: 'defend', side }); }
    const lead = Math.max(-0.4, Math.min(0.4, (active(b, 'p').stats.spd - active(b, 'f').stats.spd) / 100));
    const order = rng() < 0.5 + lead ? ['p', 'f'] : ['f', 'p'];
    const fighters = { p: active(b, 'p'), f: active(b, 'f') };
    for (const side of order) {
      const pick = picks[side], other = side === 'p' ? 'f' : 'p';
      const me = fighters[side], target = fighters[other];
      if (pick.type !== 'move' || me.hp <= 0 || target.hp <= 0 || b.winner) continue; // quem caiu não age
      me.energy -= RULES.cost[pick.slot];
      const hit = computeDamage(me, target, pick.slot, rng);
      if (guard[other]) hit.dmg = Math.max(1, Math.round(hit.dmg * RULES.defend));
      target.hp = Math.max(0, target.hp - hit.dmg);
      events.push({ kind: 'move', side, slot: pick.slot, name: TYPES[hit.type].moves[pick.slot], type: hit.type, mult: hit.mult, crit: hit.crit, dmg: hit.dmg, guarded: !!guard[other], hp: target.hp, fainted: target.hp === 0 });
    }
    // energia: +1 por rodada, +1 para quem se defendeu
    for (const side of ['p', 'f']) fighters[side].energy = Math.min(RULES.maxEnergy, fighters[side].energy + 1 + (guard[side] ? 1 : 0));
    const you2 = fighters.p;
    if (fighters.f.hp === 0 && you2.hp > 0 && b.f + 1 < b.foes.length) {
      const before = you2.hp;
      you2.hp = Math.min(you2.maxHp, you2.hp + Math.round(you2.maxHp * RULES.heal));
      if (you2.hp > before) events.push({ kind: 'heal', side: 'p', hp: you2.hp, amount: you2.hp - before });
    }
    for (const side of ['p', 'f']) {
      if (fighters[side].hp > 0) continue;
      const list = side === 'p' ? b.team : b.foes;
      if (b[side] + 1 < list.length) { b[side]++; events.push({ kind: 'enter', side, index: b[side] }); }
      else if (!b.winner) { b.winner = side === 'p' ? 'f' : 'p'; events.push({ kind: 'end', winner: b.winner }); }
    }
    return events;
  }

  const LOGIC = { TYPES, MON_TYPES, CHART, RULES, STARTERS, STARTER_STAT, CITY1, GYM1, CITIES, typesOf, multiplier, defaultSlots, flatStats, makeFighter, rivalsOf, createBattle, computeDamage, rivalChoose, playRound, active };
  if (typeof module !== 'undefined' && module.exports) { module.exports = LOGIC; return; }

  // ================================================================
  // Telas
  // ================================================================
  const FLAG = 'wp_solo_beta';
  const query = new URLSearchParams(location.search);
  try {
    if (query.get('solo') === '1') localStorage.setItem(FLAG, '1');
    if (query.get('solo') === '0') localStorage.setItem(FLAG, '0');
  } catch (e) { }
  const enabled = () => { try { return localStorage.getItem(FLAG) !== '0'; } catch (e) { return true; } };

  const api = () => window.wpSoloApi;
  const saveKey = () => `wp_solo_v1:${(api() && api().uid()) || 'visitante'}`;
  const loadSave = () => { try { return Object.assign({ starter: null, done: 0, badges: [], team: [], slots: {} }, JSON.parse(localStorage.getItem(saveKey())) || {}); } catch (e) { return { starter: null, done: 0, badges: [], team: [], slots: {} }; } };
  const writeSave = () => { try { localStorage.setItem(saveKey(), JSON.stringify(save)); } catch (e) { } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const species = dex => api().species().find(m => m.d === dex) || { n: `#${dex}`, s: '' };
  const sprite = dex => api().spriteUrl(dex);
  const typeTag = t => `<span class="ws-type" style="--c:${TYPES[t].color}">${TYPES[t].name}</span>`;

  let root = null, body = null, save = null, owned = [], token = 0;

  const style = document.createElement('style');
  style.textContent = `
    .ws-open { display: block; width: 100%; margin: 0 0 14px; padding: 11px 14px; border-radius: 12px; border: 1px solid #ffd16688; background: linear-gradient(135deg, #ffd16622, #4cc9f022); color: #f2f2f2; font: 700 14px 'DM Sans', sans-serif; cursor: pointer; }
    .ws-backdrop { position: fixed; inset: 0; z-index: 10005; background: rgba(0,0,0,.75); display: flex; align-items: flex-end; justify-content: center; }
    .ws-sheet { width: 100%; max-width: 560px; height: min(94vh, 780px); height: min(94dvh, 780px); display: flex; flex-direction: column; background: #0d0f18; color: #f2f2f2; border: 1px solid #52597a55; border-bottom: 0; border-radius: 22px 22px 0 0; font-family: 'DM Sans', sans-serif; animation: ws-up .38s cubic-bezier(.2,.9,.3,1.15); overflow: hidden; }
    @keyframes ws-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .ws-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid #ffffff12; }
    .ws-head h3 { flex: 1; margin: 0; font-size: 17px; color: #ffd166; }
    .ws-head button { background: none; border: 1px solid #ffffff22; color: #c9cee6; border-radius: 999px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 13px; }
    .ws-body { flex: 1; overflow-y: auto; padding: 14px; }
    .ws-note { font-size: 12.5px; color: #9aa0c0; line-height: 1.5; margin: 0 0 12px; }
    .ws-type { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; color: #10131f; background: var(--c); }
    .ws-btn { padding: 11px 14px; border-radius: 12px; border: 1px solid #ffffff22; background: #181c2e; color: #f2f2f2; font: 700 14px 'DM Sans', sans-serif; cursor: pointer; }
    .ws-btn:disabled { opacity: .4; cursor: default; }
    .ws-primary { background: #ffd166; color: #1a1300; border-color: #ffd166; width: 100%; }
    .ws-sticky { position: sticky; bottom: 0; box-shadow: 0 -10px 14px #0d0f18; }
    .ws-map { width: 100%; max-height: 62vh; display: block; margin: 0 auto; }
    .ws-city { cursor: pointer; }
    .ws-city.ws-locked { cursor: default; opacity: .55; }
    .ws-city text { fill: #f2f2f2; font: 700 10px 'DM Sans', sans-serif; paint-order: stroke; stroke: #0d1a24; stroke-width: 3px; }
    .ws-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .ws-card { text-align: center; background: #111422; border: 2px solid #ffffff12; border-radius: 14px; padding: 10px 6px; cursor: pointer; color: inherit; font: inherit; }
    .ws-card img { width: 72px; height: 72px; object-fit: contain; }
    .ws-card b { display: block; font-size: 13px; margin: 4px 0; }
    .ws-trail { display: flex; flex-direction: column; gap: 8px; }
    .ws-step { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid #ffffff14; background: #111422; color: inherit; font: inherit; cursor: pointer; }
    .ws-step:disabled { opacity: .4; cursor: default; }
    .ws-step.ws-next { border-color: #ffd166; }
    .ws-step.ws-gym { background: linear-gradient(135deg, #ffd16618, #b6a13633); }
    .ws-num { width: 30px; height: 30px; flex: none; border-radius: 50%; display: grid; place-items: center; background: #262b40; font-weight: 700; font-size: 13px; }
    .ws-step img { width: 34px; height: 34px; object-fit: contain; }
    .ws-step .ws-grow { flex: 1; font-size: 13px; }
    .ws-roster { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin-bottom: 12px; }
    .ws-pick { position: relative; padding: 8px 4px; }
    .ws-pick img { width: 52px; height: 52px; }
    .ws-pick.ws-on { border-color: #ffd166; }
    .ws-order { position: absolute; top: 4px; left: 6px; background: #ffd166; color: #1a1300; border-radius: 999px; width: 18px; height: 18px; font-size: 11px; font-weight: 700; display: grid; place-items: center; }
    .ws-avg { font-size: 11px; color: #9aa0c0; }
    .ws-member { background: #111422; border-radius: 12px; padding: 8px 10px; margin-bottom: 8px; font-size: 12px; }
    .ws-slotrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 5px; }
    .ws-slotrow select { background: #181c2e; color: #f2f2f2; border: 1px solid #ffffff22; border-radius: 8px; padding: 4px 6px; font: inherit; }
    .ws-stage { position: relative; height: 300px; border-radius: 14px; overflow: hidden; background: linear-gradient(#1b2a4a, #243b2f); }
    .ws-side { position: absolute; width: 48%; }
    .ws-side.ws-p { left: 2%; bottom: 8px; }
    .ws-side.ws-f { right: 2%; top: 8px; }
    .ws-side img { display: block; margin: 0 auto; width: 110px; height: 110px; object-fit: contain; animation: ws-idle 1.8s ease-in-out infinite; }
    @keyframes ws-idle { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-3px) scale(.98, 1.04); } }
    .ws-info { background: #0d0f18cc; border-radius: 10px; padding: 5px 8px; font-size: 12px; }
    .ws-hp { height: 8px; background: #262b40; border-radius: 4px; overflow: hidden; margin: 3px 0; }
    .ws-hp i { display: block; height: 100%; background: #06d6a0; transition: width .35s; }
    .ws-hp i.ws-low { background: #e63946; }
    .ws-energy { letter-spacing: 2px; color: #ffd166; font-size: 11px; }
    .ws-lunge-p { animation: ws-lunge-p .36s ease !important; }
    .ws-lunge-f { animation: ws-lunge-f .36s ease !important; }
    @keyframes ws-lunge-p { 45% { transform: translate(46px, -26px) scale(1.08); } }
    @keyframes ws-lunge-f { 45% { transform: translate(-46px, 26px) scale(1.08); } }
    .ws-shake { animation: ws-shake .42s linear !important; filter: brightness(1.9) saturate(.4); }
    @keyframes ws-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-10px); } 40% { transform: translateX(9px); } 60% { transform: translateX(-7px); } 80% { transform: translateX(5px); } }
    .ws-faint { animation: ws-faint .6s ease-in forwards !important; }
    @keyframes ws-faint { to { transform: translateY(46px) rotate(14deg); opacity: 0; } }
    .ws-shield img { filter: drop-shadow(0 0 10px #9be7ff) drop-shadow(0 0 4px #4cc9f0); }
    .ws-float { position: absolute; left: 50%; top: 34%; transform: translateX(-50%); font-weight: 800; font-size: 26px; color: #ffd166; text-shadow: 0 2px 0 #000, 0 0 6px #000; pointer-events: none; animation: ws-float .9s ease-out forwards; }
    @keyframes ws-float { to { transform: translate(-50%, -46px); opacity: 0; } }
    .ws-log { min-height: 38px; text-align: center; font-size: 13px; margin: 8px 0; color: #c9cee6; }
    .ws-moves { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .ws-moves .ws-btn { text-align: left; padding: 9px 10px; }
    .ws-moves small { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-weight: 400; font-size: 11px; color: #9aa0c0; }
    .ws-good { color: #06d6a0 !important; } .ws-bad { color: #ff8d8d !important; }
    .ws-result { text-align: center; padding: 20px 8px; }
    .ws-result h4 { font-size: 26px; margin: 0 0 8px; }
    .ws-badge { width: 90px; height: 90px; margin: 10px auto; display: block; }
    @media (prefers-reduced-motion: reduce) { .ws-sheet, .ws-side img, .ws-float { animation: none; } }
  `;
  document.head.appendChild(style);

  const badgeSvg = '<svg class="ws-badge" viewBox="0 0 100 100" aria-label="Insígnia de Pedra"><polygon points="50,4 90,28 90,72 50,96 10,72 10,28" fill="#8d8a80" stroke="#ffd166" stroke-width="5"/><polygon points="50,22 72,50 50,78 28,50" fill="#c9bba8"/></svg>';

  function close() { token++; if (root) { root.remove(); root = null; } }
  async function open() {
    if (root) return;
    save = loadSave();
    root = document.createElement('div');
    root.className = 'wp-modal-backdrop ws-backdrop'; // a classe do minigame também pausa o relógio da aparição
    root.innerHTML = `<div class="ws-sheet" role="dialog" aria-modal="true" aria-label="Modo solo">
      <div class="ws-head"><h3>Modo solo</h3><button type="button" data-go="map">🗺️ Mapa</button><button type="button" data-go="close" aria-label="Fechar">✕</button></div>
      <div class="ws-body"></div></div>`;
    document.body.appendChild(root);
    body = root.querySelector('.ws-body');
    root.querySelector('[data-go="close"]').addEventListener('click', close);
    root.querySelector('[data-go="map"]').addEventListener('click', () => showMap());
    showMap();
  }
  function screen(title, html) {
    token++;
    root.querySelector('h3').textContent = title;
    body.innerHTML = html;
    body.scrollTop = 0;
  }

  function showMap() {
    const spot = (c, i) => {
      const openCity = i === 0, won = save.badges.includes(i);
      return `<g class="ws-city ${openCity ? '' : 'ws-locked'}" data-city="${i}" role="button" tabindex="${openCity ? 0 : -1}" aria-label="${c.name}${openCity ? '' : ', em breve'}">
        <circle cx="${c.x}" cy="${c.y}" r="${i === 8 ? 17 : 14}" fill="${c.gym ? TYPES[c.gym].color : '#ffd166'}" stroke="${openCity ? '#ffffff' : '#0d1a24'}" stroke-width="${openCity ? 3 : 2}"/>
        <text x="${c.x}" y="${c.y + 4}" text-anchor="middle">${i === 8 ? '🏆' : won ? '★' : openCity ? i + 1 : '🔒'}</text>
        <text x="${c.x}" y="${c.y + 27}" text-anchor="middle">${c.name}</text></g>`;
    };
    const path = CITIES.map((c, i) => `${i ? 'L' : 'M'}${c.x} ${c.y}`).join(' ');
    screen('Kanto', `<p class="ws-note">Versão de teste: só a primeira cidade está aberta. O progresso fica neste aparelho e ainda não há prêmios.</p>
      <svg class="ws-map" viewBox="0 0 300 310">
        <rect width="300" height="310" rx="18" fill="#17496b"/>
        <path d="M20 34 C60 6 120 30 175 22 S285 30 288 100 282 180 276 215 250 262 185 252 120 245 95 215 25 215 20 175 8 60 20 34Z" fill="#3f7d46" stroke="#d9c88f" stroke-width="3"/>
        <ellipse cx="56" cy="266" rx="40" ry="26" fill="#3f7d46" stroke="#d9c88f" stroke-width="3"/>
        <path d="M84 48 l12 -22 12 22 z M104 50 l10 -17 10 17 z" fill="#8d8a80"/>
        <path d="${path}" fill="none" stroke="#e9dcae" stroke-width="4" stroke-dasharray="2 7" stroke-linecap="round"/>
        ${CITIES.map(spot).join('')}
      </svg>
      <p class="ws-note" style="margin-top:10px">Insígnias: ${save.badges.length} de 8</p>
      <button type="button" class="ws-btn ws-primary" data-go="city">${save.starter ? 'Ir para Pewter' : 'Começar em Pewter'}</button>`);
    const enter = () => (save.starter ? showTrail() : showStarter());
    body.querySelector('[data-go="city"]').addEventListener('click', enter);
    const first = body.querySelector('[data-city="0"]');
    first.addEventListener('click', enter);
    first.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); } });
  }

  function showStarter() {
    screen('Escolha seu inicial', `<p class="ws-note">Todos começam com um destes, com ${STARTER_STAT} em cada atributo. A escolha não muda depois.</p>
      <div class="ws-cards">${STARTERS.map(d => `<button type="button" class="ws-card" data-dex="${d}"><img src="${sprite(d)}" alt=""><b>${esc(species(d).n)}</b>${typesOf(d).map(typeTag).join(' ')}</button>`).join('')}</div>
      <p class="ws-note" style="margin-top:12px">O ginásio de Pewter é de Pedra: Água e Planta têm vantagem nele. Quem começa com Fogo vai precisar capturar ajuda no minigame.</p>`);
    body.querySelectorAll('[data-dex]').forEach(b => b.addEventListener('click', () => {
      save.starter = Number(b.dataset.dex);
      save.team = ['starter'];
      writeSave();
      showTrail();
    }));
  }

  const stageList = () => CITY1.concat([GYM1]);
  function showTrail() {
    const rows = stageList().map((foes, i) => {
      const gym = i === CITY1.length, done = i < save.done, next = i === save.done;
      const types = [...new Set(foes.flatMap(f => typesOf(f.dex)))];
      return `<button type="button" class="ws-step ${next ? 'ws-next' : ''} ${gym ? 'ws-gym' : ''}" data-stage="${i}" ${i > save.done ? 'disabled' : ''}>
        <span class="ws-num">${done ? '✓' : gym ? '★' : i + 1}</span>
        <span class="ws-grow"><b>${gym ? 'Ginásio de Pewter' : `Combate ${i + 1}`}</b><br>${types.map(typeTag).join(' ')} <span class="ws-avg">força ${foes[foes.length - 1].level}</span></span>
        ${foes.map(f => `<img src="${sprite(f.dex)}" alt="${esc(species(f.dex).n)}">`).join('')}</button>`;
    }).join('');
    screen('Pewter', `<p class="ws-note">${save.badges.includes(0) ? 'Você já tem a Insígnia de Pedra. Dá pra repetir os combates quando quiser.' : `${Math.min(save.done, CITY1.length)} de ${CITY1.length} combates vencidos. O ginásio abre depois do décimo.`}</p><div class="ws-trail">${rows}</div>`);
    body.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => showTeam(Number(b.dataset.stage))));
    const next = body.querySelector('.ws-next');
    if (next) next.scrollIntoView({ block: 'center' });
  }

  // lista do que a pessoa pode levar: o inicial e a mochila do minigame
  function roster() {
    const list = [{ id: 'starter', dex: save.starter, stats: flatStats(STARTER_STAT), nick: null }];
    owned.forEach(e => list.push({ id: e.id, dex: e.dex, stats: e, nick: e.nickname }));
    return list;
  }
  const avgOf = s => Math.round((s.hp + s.atk + s.def + s.spd + s.crit) / 5);
  function slotsFor(item) {
    const t = typesOf(item.dex), saved = save.slots[item.id];
    return saved && saved.length === 3 && saved.every(x => t.includes(x)) ? saved.slice() : defaultSlots(item.dex);
  }

  async function showTeam(index) {
    screen('Seu time', '<p class="ws-note">Carregando a mochila…</p>');
    const mine = token;
    try { owned = (await api().backpack()) || []; } catch (e) { owned = []; }
    if (mine !== token || !root) return;
    const all = roster();
    save.team = save.team.filter(id => all.some(r => r.id === id)).slice(0, 3);
    if (!save.team.length) save.team = ['starter'];
    renderTeam(index);
  }
  function renderTeam(index) {
    const keep = body.scrollTop;
    const all = roster(), foes = stageList()[index];
    const foeTypes = [...new Set(foes.flatMap(f => typesOf(f.dex)))];
    const sorted = all.slice().sort((a, b) => (a.id === 'starter' ? -1 : b.id === 'starter' ? 1 : avgOf(b.stats) - avgOf(a.stats)));
    const chosen = save.team.map(id => all.find(r => r.id === id));
    screen('Seu time', `<p class="ws-note">Rivais: ${foeTypes.map(typeTag).join(' ')} · ${foes.length} Pokémon. Escolha até 3, na ordem em que entram.${owned.length ? '' : ' Capture Pokémon no minigame para ter mais opções (precisa de conta).'}</p>
      <div class="ws-roster">${sorted.map(r => {
        const pos = save.team.indexOf(r.id);
        return `<button type="button" class="ws-card ws-pick ${pos >= 0 ? 'ws-on' : ''}" data-id="${esc(r.id)}" aria-pressed="${pos >= 0}">${pos >= 0 ? `<span class="ws-order">${pos + 1}</span>` : ''}<img src="${sprite(r.dex)}" alt=""><b>${esc(r.nick || species(r.dex).n)}</b>${typesOf(r.dex).map(typeTag).join(' ')}<div class="ws-avg">média ${avgOf(r.stats)}</div></button>`;
      }).join('')}</div>
      ${chosen.map(r => {
        const slots = slotsFor(r), types = typesOf(r.dex);
        return `<div class="ws-member"><b>${esc(r.nick || species(r.dex).n)}</b>${['Fraco', 'Médio', 'Forte'].map((label, s) => `<div class="ws-slotrow"><span>${label}${RULES.cost[s] ? ` · ${RULES.cost[s]} ⚡` : ''}</span>${types.length > 1
          ? `<select data-member="${esc(r.id)}" data-slot="${s}" aria-label="Golpe ${label.toLowerCase()}">${types.map(t => `<option value="${t}" ${slots[s] === t ? 'selected' : ''}>${TYPES[t].moves[s]} (${TYPES[t].name})</option>`).join('')}</select>`
          : `<span>${TYPES[types[0]].moves[s]} ${typeTag(types[0])}</span>`}</div>`).join('')}</div>`;
      }).join('')}
      <button type="button" class="ws-btn ws-primary ws-sticky" data-go="fight">⚔️ Lutar</button>`);
    body.scrollTop = keep;
    body.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id, pos = save.team.indexOf(id);
      if (pos >= 0) { if (save.team.length > 1) save.team.splice(pos, 1); }
      else if (save.team.length < 3) save.team.push(id);
      writeSave();
      renderTeam(index);
    }));
    body.querySelectorAll('select[data-member]').forEach(sel => sel.addEventListener('change', () => {
      const item = all.find(r => r.id === sel.dataset.member), slots = slotsFor(item);
      slots[Number(sel.dataset.slot)] = sel.value;
      save.slots[item.id] = slots;
      writeSave();
    }));
    body.querySelector('[data-go="fight"]').addEventListener('click', () => startBattle(index));
  }

  function startBattle(index) {
    const all = roster();
    const team = save.team.map(id => all.find(r => r.id === id)).map(r => makeFighter(r.dex, r.stats, { slots: slotsFor(r), nick: r.nick }));
    const battle = createBattle(team, rivalsOf(stageList()[index]), index >= CITY1.length ? 1 : index / 20);
    screen(index >= CITY1.length ? 'Ginásio de Pewter' : `Combate ${index + 1}`, `
      <div class="ws-stage">
        <div class="ws-side ws-f" data-side="f"></div>
        <div class="ws-side ws-p" data-side="p"></div>
      </div>
      <div class="ws-log" role="status">Escolha um golpe.</div>
      <div class="ws-moves"></div>`);
    const mine = token;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const alive = () => mine === token && root;
    const sideEl = s => body.querySelector(`[data-side="${s}"]`);
    const nameOf = (s, f) => esc(f.nick || species(f.dex).n) + (s === 'f' ? ' rival' : '');
    function drawSide(s) {
      const f = active(battle, s), left = (s === 'p' ? battle.team.length - battle.p : battle.foes.length - battle.f);
      const info = `<div class="ws-info"><b>${nameOf(s, f)}</b> ${f.types.map(typeTag).join(' ')}<div class="ws-hp"><i style="width:${100 * f.hp / f.maxHp}%" class="${f.hp / f.maxHp < .3 ? 'ws-low' : ''}"></i></div><span class="ws-hptext">${f.hp}/${f.maxHp}</span> <span class="ws-energy">${'●'.repeat(f.energy)}${'○'.repeat(RULES.maxEnergy - f.energy)}</span> <span class="ws-avg" title="Pokémon que restam no time">×${left}</span></div>`;
      const img = `<img src="${sprite(f.dex)}" alt="${nameOf(s, f)}">`;
      sideEl(s).innerHTML = s === 'p' ? img + info : info + img;
    }
    function drawMoves(locked) {
      const me = active(battle, 'p'), foe = active(battle, 'f');
      const box = body.querySelector('.ws-moves');
      box.innerHTML = [0, 1, 2].map(s => {
        const t = me.slots[s], m = multiplier(t, foe.types);
        return `<button type="button" class="ws-btn" data-slot="${s}" ${locked || me.energy < RULES.cost[s] ? 'disabled' : ''} style="border-left:4px solid ${TYPES[t].color}">${TYPES[t].moves[s]}<small><span class="${m > 1 ? 'ws-good' : m < 1 ? 'ws-bad' : ''}">${m > 1 ? '▲ vantagem' : m < 1 ? '▼ pouco efeito' : TYPES[t].name}</span><span>${RULES.cost[s] ? `${RULES.cost[s]} ⚡` : 'livre'}</span></small></button>`;
      }).join('') + `<button type="button" class="ws-btn" data-defend="1" ${locked ? 'disabled' : ''}>🛡️ Defender<small><span>metade do dano</span><span>+1 ⚡</span></small></button>`;
      box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => turn(b.dataset.defend ? { type: 'defend' } : { type: 'move', slot: Number(b.dataset.slot) })));
    }
    async function turn(action) {
      const log = body.querySelector('.ws-log');
      const before = { p: active(battle, 'p'), f: active(battle, 'f') };
      const hpShown = { p: before.p.hp, f: before.f.hp };
      const events = playRound(battle, action);
      if (!events.length) return;
      drawMoves(true);
      for (const ev of events) {
        if (!alive()) return;
        if (ev.kind === 'defend') {
          sideEl(ev.side).classList.add('ws-shield');
          log.textContent = `${ev.side === 'p' ? 'Você' : 'O rival'} se defende.`;
          await wait(450);
        } else if (ev.kind === 'move') {
          const other = ev.side === 'p' ? 'f' : 'p';
          log.innerHTML = `<b>${nameOf(ev.side, before[ev.side])}</b>: ${ev.name}!`;
          const img = sideEl(ev.side).querySelector('img');
          img.classList.add(`ws-lunge-${ev.side}`);
          await wait(260);
          if (!alive()) return;
          const victim = sideEl(other).querySelector('img');
          victim.classList.add('ws-shake');
          sideEl(other).insertAdjacentHTML('beforeend', `<span class="ws-float">-${ev.dmg}</span>`);
          hpShown[other] = ev.hp;
          const f = before[other], bar = sideEl(other).querySelector('.ws-hp i');
          bar.style.width = `${100 * ev.hp / f.maxHp}%`;
          bar.classList.toggle('ws-low', ev.hp / f.maxHp < .3);
          sideEl(other).querySelector('.ws-hptext').textContent = `${ev.hp}/${f.maxHp}`;
          const extra = [ev.crit ? 'Golpe crítico!' : '', ev.mult > 1 ? 'Vantagem de tipo!' : ev.mult < 1 ? 'Pouco efeito.' : '', ev.guarded ? 'O escudo segurou metade.' : ''].filter(Boolean).join(' ');
          if (extra) log.insertAdjacentHTML('beforeend', `<br>${extra}`);
          await wait(520);
          if (!alive()) return;
          img.classList.remove(`ws-lunge-${ev.side}`);
          victim.classList.remove('ws-shake');
          if (ev.fainted) { victim.classList.add('ws-faint'); log.innerHTML = `<b>${nameOf(other, f)}</b> desmaiou.`; await wait(750); }
        } else if (ev.kind === 'heal') {
          const f = before[ev.side], bar = sideEl(ev.side).querySelector('.ws-hp i');
          bar.style.width = `${100 * ev.hp / f.maxHp}%`;
          bar.classList.toggle('ws-low', ev.hp / f.maxHp < .3);
          sideEl(ev.side).querySelector('.ws-hptext').textContent = `${ev.hp}/${f.maxHp}`;
          log.innerHTML = `<b>${nameOf(ev.side, f)}</b> recuperou ${ev.amount} de vida.`;
          await wait(550);
        } else if (ev.kind === 'enter') {
          drawSide(ev.side);
          log.innerHTML = `<b>${nameOf(ev.side, active(battle, ev.side))}</b> entra na luta.`;
          await wait(600);
        } else if (ev.kind === 'end') {
          await wait(350);
          if (alive()) finish(index, ev.winner === 'p');
          return;
        }
      }
      if (!alive()) return;
      for (const s of ['p', 'f']) { sideEl(s).classList.remove('ws-shield'); drawSide(s); }
      log.textContent = 'Sua vez.';
      drawMoves(false);
    }
    drawSide('p'); drawSide('f'); drawMoves(false);
  }

  function finish(index, won) {
    const gym = index >= CITY1.length;
    if (won) {
      save.done = Math.max(save.done, index + 1);
      if (gym && !save.badges.includes(0)) save.badges.push(0);
      writeSave();
    }
    screen(won ? 'Vitória' : 'Derrota', `<div class="ws-result">
      <h4>${won ? (gym ? 'Ginásio vencido!' : 'Você venceu!') : 'Não foi dessa vez'}</h4>
      ${won && gym ? `${badgeSvg}<p><b>Insígnia de Pedra</b> conquistada.</p><p class="ws-note">As próximas cidades chegam nas próximas versões.</p>` : ''}
      <p class="ws-note">${won ? (gym ? '' : 'O próximo combate está liberado.') : 'Dicas: veja o tipo dos rivais, leve quem tem vantagem e guarde energia para o golpe forte. Pokémon com média maior, capturados no minigame, batem mais forte.'}</p>
      <button type="button" class="ws-btn ws-primary" data-go="next">${won ? 'Continuar na trilha' : 'Mudar o time e tentar de novo'}</button></div>`);
    body.querySelector('[data-go="next"]').addEventListener('click', () => (won ? showTrail() : showTeam(index)));
  }

  window.wsSolo = { enabled, open, close, logic: LOGIC };
})();
