// ================================================================
// MyDeck — Parceiros Iniciais Escondidos (wild_pokemon.js) — TESTE
// ================================================================
// Protótipo do sistema de "Pokémon escondidos": de tempos em tempos,
// um Pokémon aparece espiando de um canto da tela por alguns segundos.
// Clicar nele antes que suma = captura, registrada localmente.
//
// Escopo deste teste: só os 27 Parceiros Iniciais do MEP (Séries 1-3,
// cards_mep.js #037-#063) — Kanto, Sinnoh, Alola, Johto, Unova, Galar,
// Hoenn, Kalos e Paldea. Se o teste validar a mecânica, dá pra trocar
// o pool por POKEDEX_NACIONAL inteira depois.
//
// Arquivo AUTOCONTIDO (mesmo padrão de xp_system.js — ver
// feedback_coding): não edita app.js. Plugado via monkey-patch de
// window.go, com poll até o global existir. CSS injetado via <style>.
// HTML montado 100% via JS. Prefixo wp* em todo global pra não colidir
// com nada de app.js/xp_system.js/fichario_*.js.
//
// Persistência: por enquanto só localStorage (é teste — sem Supabase
// ainda). Se validar, migra pra uma tabela `wild_catches` com o mesmo
// padrão RLS user_id=auth.uid() das outras tabelas do projeto.
//
// Pra Eduardo testar rápido: WP_TEST_MODE=true deixa os spawns bem
// mais frequentes (20-40s) e com chance alta. Trocar pra false quando
// for validar o ritmo "de verdade" (5-10min).
//
// Debug no console:
//   wpForceSpawn()   → força um Pokémon aparecer agora
//   wpReset()        → zera a coleção local (localStorage)
//   wpStatus()        → mostra quantos já foram capturados
// ================================================================

(function () {
  'use strict';

  const WP_TEST_MODE = true; // ⚠️ trocar pra false depois de validar o ritmo
  const WP_STORAGE_KEY = 'wp_wild_catches_v1';
  const WP_LIFETIME_MS = 6000; // quanto tempo o Pokémon fica visível antes de sumir

  // ── Pool: Parceiros Iniciais (cards_mep.js #037-#063) ──────────
  const WP_STARTERS = [
    { dex: 1,   slug: 'bulbasaur',  name: 'Bulbasaur',  region: 'Kanto',  type: 'Grama',    color: '#4CAF50' },
    { dex: 4,   slug: 'charmander', name: 'Charmander', region: 'Kanto',  type: 'Fogo',     color: '#F44336' },
    { dex: 7,   slug: 'squirtle',   name: 'Squirtle',   region: 'Kanto',  type: 'Aquático', color: '#2196F3' },
    { dex: 387, slug: 'turtwig',    name: 'Turtwig',    region: 'Sinnoh', type: 'Grama',    color: '#4CAF50' },
    { dex: 390, slug: 'chimchar',   name: 'Chimchar',   region: 'Sinnoh', type: 'Fogo',     color: '#F44336' },
    { dex: 393, slug: 'piplup',     name: 'Piplup',     region: 'Sinnoh', type: 'Aquático', color: '#2196F3' },
    { dex: 722, slug: 'rowlet',     name: 'Rowlet',     region: 'Alola',  type: 'Grama',    color: '#4CAF50' },
    { dex: 725, slug: 'litten',     name: 'Litten',     region: 'Alola',  type: 'Fogo',     color: '#F44336' },
    { dex: 728, slug: 'popplio',    name: 'Popplio',    region: 'Alola',  type: 'Aquático', color: '#2196F3' },
    { dex: 152, slug: 'chikorita',  name: 'Chikorita',  region: 'Johto',  type: 'Grama',    color: '#4CAF50' },
    { dex: 155, slug: 'cyndaquil',  name: 'Cyndaquil',  region: 'Johto',  type: 'Fogo',     color: '#F44336' },
    { dex: 158, slug: 'totodile',   name: 'Totodile',   region: 'Johto',  type: 'Aquático', color: '#2196F3' },
    { dex: 495, slug: 'snivy',      name: 'Snivy',      region: 'Unova',  type: 'Grama',    color: '#4CAF50' },
    { dex: 498, slug: 'tepig',      name: 'Tepig',      region: 'Unova',  type: 'Fogo',     color: '#F44336' },
    { dex: 501, slug: 'oshawott',   name: 'Oshawott',   region: 'Unova',  type: 'Aquático', color: '#2196F3' },
    { dex: 810, slug: 'grookey',    name: 'Grookey',    region: 'Galar',  type: 'Grama',    color: '#4CAF50' },
    { dex: 813, slug: 'scorbunny',  name: 'Scorbunny',  region: 'Galar',  type: 'Fogo',     color: '#F44336' },
    { dex: 816, slug: 'sobble',     name: 'Sobble',     region: 'Galar',  type: 'Aquático', color: '#2196F3' },
    { dex: 252, slug: 'treecko',    name: 'Treecko',    region: 'Hoenn',  type: 'Grama',    color: '#4CAF50' },
    { dex: 255, slug: 'torchic',    name: 'Torchic',    region: 'Hoenn',  type: 'Incolor',  color: '#9E9E9E' },
    { dex: 258, slug: 'mudkip',     name: 'Mudkip',     region: 'Hoenn',  type: 'Aquático', color: '#2196F3' },
    { dex: 650, slug: 'chespin',    name: 'Chespin',    region: 'Kalos',  type: 'Grama',    color: '#4CAF50' },
    { dex: 653, slug: 'fennekin',   name: 'Fennekin',   region: 'Kalos',  type: 'Fogo',     color: '#F44336' },
    { dex: 656, slug: 'froakie',    name: 'Froakie',    region: 'Kalos',  type: 'Incolor',  color: '#9E9E9E' },
    { dex: 906, slug: 'sprigatito', name: 'Sprigatito', region: 'Paldea', type: 'Grama',    color: '#4CAF50' },
    { dex: 909, slug: 'fuecoco',    name: 'Fuecoco',    region: 'Paldea', type: 'Fogo',     color: '#F44336' },
    { dex: 912, slug: 'quaxly',     name: 'Quaxly',     region: 'Paldea', type: 'Aquático', color: '#2196F3' },
  ];

  function wpSpriteUrl(dex) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;
  }

  // ── Persistência local (teste — sem Supabase ainda) ────────────
  function wpLoadCatches() {
    try { return JSON.parse(localStorage.getItem(WP_STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function wpSaveCatches(obj) {
    try { localStorage.setItem(WP_STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  let wpCatches = wpLoadCatches(); // { [slug]: { count, firstCaughtAt } }

  // ── CSS ──────────────────────────────────────────────────────
  const wpStyle = document.createElement('style');
  wpStyle.textContent = `
    .wp-spawn {
      position: fixed;
      z-index: 9998;
      width: 76px; height: 76px;
      cursor: pointer;
      filter: drop-shadow(0 4px 14px rgba(0,0,0,.55));
      transition: transform .35s cubic-bezier(.34,1.56,.64,1);
      touch-action: manipulation;
    }
    .wp-spawn img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
    .wp-spawn.wp-bl { left: -70px; bottom: 18px; }
    .wp-spawn.wp-br { right: -70px; bottom: 18px; }
    .wp-spawn.wp-tl { left: -70px; top: 90px; }
    .wp-spawn.wp-in.wp-bl { transform: translateX(78px); }
    .wp-spawn.wp-in.wp-br { transform: translateX(-78px); }
    .wp-spawn.wp-in.wp-tl { transform: translateX(78px); }
    .wp-spawn.wp-peek { animation: wpPeek 1.8s ease-in-out infinite; }
    @keyframes wpPeek {
      0%, 100% { transform: translateX(var(--wpx,78px)) rotate(0deg); }
      50%      { transform: translateX(var(--wpx,78px)) translateY(-8px) rotate(-4deg); }
    }
    .wp-spawn.wp-caught { animation: wpCaught .5s ease-out forwards; }
    @keyframes wpCaught {
      0%   { transform: scale(1); opacity: 1; }
      60%  { transform: scale(1.3); opacity: .8; }
      100% { transform: scale(0); opacity: 0; }
    }
    .wp-toast {
      position: fixed; left: 50%; bottom: 90px; transform: translateX(-50%) translateY(20px);
      background: linear-gradient(135deg, #111422, #181c2e);
      border: 1px solid #ffd16655;
      color: #f2f2f2;
      padding: 12px 20px;
      border-radius: 12px;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      z-index: 10000;
      display: flex; align-items: center; gap: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.5);
      opacity: 0;
      transition: opacity .35s ease, transform .35s ease;
    }
    .wp-toast.wp-show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .wp-toast img { width: 34px; height: 34px; object-fit: contain; }
    .wp-toast b { color: #ffd166; font-family: 'Bebas Neue', sans-serif; letter-spacing: .5px; }
    .wp-badge {
      position: fixed; left: 14px; bottom: 14px; z-index: 9997;
      background: #111422; border: 1px solid #52597a55;
      color: #f2f2f2; font-family: 'Space Mono', monospace; font-size: 13px;
      padding: 8px 12px; border-radius: 999px;
      display: flex; align-items: center; gap: 6px;
      cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.4);
    }
    .wp-badge:hover { border-color: #ffd166aa; }
    .wp-modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 10001;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .wp-modal {
      background: #0d0f18; border: 1px solid #52597a44; border-radius: 16px;
      max-width: 560px; width: 100%; max-height: 82vh; overflow-y: auto;
      padding: 22px; font-family: 'DM Sans', sans-serif; color: #f2f2f2;
    }
    .wp-modal h3 { font-family: 'Bebas Neue', sans-serif; letter-spacing: .5px; font-size: 24px; margin: 0 0 4px; color: #ffd166; }
    .wp-modal .wp-sub { color: #9aa0c0; font-size: 13px; margin-bottom: 16px; }
    .wp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 10px; }
    .wp-cell { background: #111422; border-radius: 10px; padding: 8px; text-align: center; border: 1px solid #ffffff0d; }
    .wp-cell img { width: 48px; height: 48px; object-fit: contain; opacity: .25; filter: grayscale(1); }
    .wp-cell.wp-got img { opacity: 1; filter: none; }
    .wp-cell .wp-n { font-size: 10.5px; margin-top: 4px; color: #9aa0c0; }
    .wp-cell.wp-got .wp-n { color: #06d6a0; }
    .wp-close { float: right; background: none; border: none; color: #9aa0c0; font-size: 20px; cursor: pointer; }
  `;
  document.head.appendChild(wpStyle);

  // ── Spawn engine ─────────────────────────────────────────────
  let wpActiveEl = null;
  const WP_CORNERS = ['wp-bl', 'wp-br', 'wp-tl'];

  function wpPickStarter() {
    return WP_STARTERS[Math.floor(Math.random() * WP_STARTERS.length)];
  }

  function wpSpawn(chance) {
    if (wpActiveEl) return; // só 1 por vez na tela
    if (Math.random() > chance) return;

    const mon = wpPickStarter();
    const corner = WP_CORNERS[Math.floor(Math.random() * WP_CORNERS.length)];

    const el = document.createElement('div');
    el.className = `wp-spawn ${corner}`;
    el.innerHTML = `<img src="${wpSpriteUrl(mon.dex)}" alt="${mon.name}">`;
    el.title = '???';
    document.body.appendChild(el);
    wpActiveEl = el;

    // força reflow antes de animar entrada
    requestAnimationFrame(() => {
      el.classList.add('wp-in', 'wp-peek');
    });

    const timeoutId = setTimeout(() => wpDespawn(el), WP_LIFETIME_MS);

    el.addEventListener('click', () => {
      clearTimeout(timeoutId);
      wpCatch(mon, el);
    }, { once: true });
  }

  function wpDespawn(el) {
    if (!el || el !== wpActiveEl) return;
    el.classList.remove('wp-in', 'wp-peek');
    setTimeout(() => { el.remove(); }, 400);
    wpActiveEl = null;
  }

  function wpCatch(mon, el) {
    wpCatches[mon.slug] = wpCatches[mon.slug] || { count: 0 };
    wpCatches[mon.slug].count++;
    wpCatches[mon.slug].firstCaughtAt = wpCatches[mon.slug].firstCaughtAt || Date.now();
    wpSaveCatches(wpCatches);

    el.classList.remove('wp-peek');
    el.classList.add('wp-caught');
    setTimeout(() => { el.remove(); }, 500);
    wpActiveEl = null;

    wpToast(mon);
    wpUpdateBadge();
  }

  // ── Toast ────────────────────────────────────────────────────
  function wpToast(mon) {
    const el = document.createElement('div');
    el.className = 'wp-toast';
    const isNew = wpCatches[mon.slug].count === 1;
    el.innerHTML = `<img src="${wpSpriteUrl(mon.dex)}" alt=""><span>${isNew ? 'Capturado!' : 'De novo!'} <b>${mon.name}</b> · ${mon.region}</span>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('wp-show'));
    setTimeout(() => {
      el.classList.remove('wp-show');
      setTimeout(() => el.remove(), 350);
    }, 3200);
  }

  // ── Badge + mini-dex ─────────────────────────────────────────
  let wpBadgeEl = null;

  function wpUpdateBadge() {
    if (!wpBadgeEl) return;
    const total = Object.keys(wpCatches).length;
    wpBadgeEl.innerHTML = `🐾 ${total}/${WP_STARTERS.length}`;
  }

  function wpBuildBadge() {
    if (wpBadgeEl) return;
    wpBadgeEl = document.createElement('div');
    wpBadgeEl.className = 'wp-badge';
    wpBadgeEl.addEventListener('click', wpOpenDex);
    document.body.appendChild(wpBadgeEl);
    wpUpdateBadge();
  }

  function wpOpenDex() {
    const backdrop = document.createElement('div');
    backdrop.className = 'wp-modal-backdrop';
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

    const total = Object.keys(wpCatches).length;
    const cells = WP_STARTERS.map(mon => {
      const got = !!wpCatches[mon.slug];
      return `<div class="wp-cell ${got ? 'wp-got' : ''}">
        <img src="${wpSpriteUrl(mon.dex)}" alt="">
        <div class="wp-n">${got ? mon.name : '???'}</div>
      </div>`;
    }).join('');

    backdrop.innerHTML = `<div class="wp-modal">
      <button class="wp-close" aria-label="Fechar">×</button>
      <h3>🐾 Parceiros Escondidos</h3>
      <div class="wp-sub">${total}/${WP_STARTERS.length} capturados — flagre os Pokémon que aparecem espiando pelo site</div>
      <div class="wp-grid">${cells}</div>
    </div>`;

    document.body.appendChild(backdrop);
    backdrop.querySelector('.wp-close').addEventListener('click', () => backdrop.remove());
  }

  // ── Timer base ───────────────────────────────────────────────
  function wpScheduleBase() {
    const intervalMs = WP_TEST_MODE
      ? (20 + Math.random() * 20) * 1000       // 20-40s no modo teste
      : (5 + Math.random() * 5) * 60 * 1000;   // 5-10min no modo real
    setTimeout(() => {
      wpSpawn(WP_TEST_MODE ? 0.9 : 0.45);
      wpScheduleBase();
    }, intervalMs);
  }

  // ── Hook em window.go (troca de aba) — mesmo padrão de xp_system.js ──
  (function hookWildPokemon() {
    function tryHook() {
      if (typeof window.go !== 'function') {
        setTimeout(tryHook, 50);
        return;
      }
      const originalGo = window.go;
      window.go = function (id, el) {
        originalGo(id, el);
        wpSpawn(WP_TEST_MODE ? 0.5 : 0.15); // chance extra ao trocar de aba
      };
    }
    tryHook();
  })();

  // ── Boot ─────────────────────────────────────────────────────
  function wpInit() {
    wpBuildBadge();
    wpScheduleBase();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wpInit);
  } else {
    wpInit();
  }

  // ── Debug (console) ─────────────────────────────────────────
  window.wpForceSpawn = () => wpSpawn(1);
  window.wpReset = () => { wpCatches = {}; wpSaveCatches(wpCatches); wpUpdateBadge(); };
  window.wpStatus = () => `${Object.keys(wpCatches).length}/${WP_STARTERS.length} capturados`;
})();
