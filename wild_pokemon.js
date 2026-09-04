// ================================================================
// MyDeck — Pokémon Escondidos + Pokébolas (wild_pokemon.js) — v2 TESTE
// ================================================================
// v2 (18/08/2026): evolução do protótipo v1 (27 Parceiros Iniciais).
// Mudanças: pool = Kanto 151 completo, sistema de pokébolas (ganhar
// por uso do site, jogar na captura com chance de fuga), suspense
// de captura (bola treme antes de confirmar), som opcional (mudo
// por padrão), coleção com raridade.
//
// Ainda é TESTE — persistência 100% localStorage, sem Supabase e
// sem integração real com xp_system.js. Se validar a sensação de
// jogo, o próximo passo é migrar pra tabela Supabase com RPC
// (mesmo padrão anti-cheat do leilão/XP) — ver [[project_pokemon_escondidos]].
//
// Arquivo AUTOCONTIDO: não edita app.js/style.css/index.html (além
// da 1 linha de <script> já existente). Prefixo wp* em tudo.
//
// ── Raridade (Kanto 151, classificação por estágio de evolução) ──
// comum (70): formas base/intermediárias de linhas evolutivas
// rara (54): evoluções finais "normais"
// especial (21): evoluções finais icônicas/fortes + únicos (Ditto,
//   Porygon, Eeveelutions, fósseis, Snorlax, Kangaskhan, Chansey...)
// ultra_rara (6): as 5 lendárias de Kanto (Articuno/Zapdos/Moltres/
//   Mewtwo/Mew) + Dragonite (pseudo-lendário)
// Rascunho ajustável — dex/nome vêm de POKEDEX_NACIONAL (pokedex_nacional.js),
// raridade foi atribuída manualmente, não pela PokeAPI.
//
// ── Pokébolas ──────────────────────────────────────────────────
// 4 tipos: pokeball < greatball < ultraball < masterball. Cada uma
// tem uma chance de captura por raridade (ver WP_CATCH_RATES). A
// bola é sempre consumida na tentativa (sucesso ou fuga), igual ao
// jogo oficial — isso dá peso real à escolha de qual bola usar.
//
// Ganho de bolas nesta fase de teste: ainda não conectado às ações
// reais do site (vencer leilão, completar set etc — isso fica pra
// quando migrar pro Supabase). Por enquanto: uso do site (timer +
// troca de aba) dá chance de Poké Ball, e existe uma função pública
// pra simular outros gatilhos:
//   window.wpGrantBall('greatball', 1, 'teste manual')
//
// ── Botões no badge (canto inferior esquerdo) ──────────────────
//   🎮/🚫  liga/desliga o minigame inteiro (para de aparecer e de
//          dar bola; some qualquer Pokémon na tela na hora)
//   🔊/🔇  liga/desliga o som
//
// ── Debug no console ─────────────────────────────────────────
//   wpForceSpawn()              → força um Pokémon aparecer agora
//   wpGrantBall(tier, qty, why) → dá bolas (tier: pokeball/greatball/ultraball/masterball)
//   wpToggle()                  → liga/desliga o minigame (mesmo botão do badge)
//   wpReset()                   → zera capturas E bolas
//   wpStatus()                  → mostra progresso + inventário
// ================================================================

(function () {
  'use strict';

  const WP_TEST_MODE = false; // modo real — cadência de verdade (~3.75min de intervalo médio, ver WP_DAILY_TARGETS)
  const WP_STORAGE_CATCHES = 'wp_wild_catches_v2';
  const WP_STORAGE_BALLS = 'wp_wild_balls_v2';
  const WP_STORAGE_SOUND = 'wp_sound_on_v1';
  const WP_STORAGE_ENABLED = 'wp_enabled_v1';
  const WP_STORAGE_DAILY_BALLS = 'wp_daily_balls_v1'; // { date, count } — teto de Poké Ball ganha só por ficar com o site aberto
  const WP_STORAGE_DAILY_BONUS = 'wp_daily_bonus_v1'; // 'YYYY-MM-DD' do último dia em que já deu a Great Ball de primeiro acesso
  const WP_DAILY_BALL_CAP = 5; // máximo de Poké Ball/dia só pelo ganho passivo (uso do site) — não limita ganhos manuais/por ação real
  const WP_LIFETIME_MS = 8000; // quanto tempo o Pokémon fica visível antes de sumir sozinho

  // ── Dados: Kanto 151 (dex, slug PokeAPI, nome, raridade) ──────
  const WP_KANTO151 = [
    {d:1,s:"bulbasaur",n:"Bulbasaur",r:"comum"},
    {d:2,s:"ivysaur",n:"Ivysaur",r:"comum"},
    {d:3,s:"venusaur",n:"Venusaur",r:"especial"},
    {d:4,s:"charmander",n:"Charmander",r:"comum"},
    {d:5,s:"charmeleon",n:"Charmeleon",r:"comum"},
    {d:6,s:"charizard",n:"Charizard",r:"especial"},
    {d:7,s:"squirtle",n:"Squirtle",r:"comum"},
    {d:8,s:"wartortle",n:"Wartortle",r:"comum"},
    {d:9,s:"blastoise",n:"Blastoise",r:"especial"},
    {d:10,s:"caterpie",n:"Caterpie",r:"comum"},
    {d:11,s:"metapod",n:"Metapod",r:"comum"},
    {d:12,s:"butterfree",n:"Butterfree",r:"rara"},
    {d:13,s:"weedle",n:"Weedle",r:"comum"},
    {d:14,s:"kakuna",n:"Kakuna",r:"comum"},
    {d:15,s:"beedrill",n:"Beedrill",r:"rara"},
    {d:16,s:"pidgey",n:"Pidgey",r:"comum"},
    {d:17,s:"pidgeotto",n:"Pidgeotto",r:"comum"},
    {d:18,s:"pidgeot",n:"Pidgeot",r:"rara"},
    {d:19,s:"rattata",n:"Rattata",r:"comum"},
    {d:20,s:"raticate",n:"Raticate",r:"rara"},
    {d:21,s:"spearow",n:"Spearow",r:"comum"},
    {d:22,s:"fearow",n:"Fearow",r:"rara"},
    {d:23,s:"ekans",n:"Ekans",r:"comum"},
    {d:24,s:"arbok",n:"Arbok",r:"rara"},
    {d:25,s:"pikachu",n:"Pikachu",r:"comum"},
    {d:26,s:"raichu",n:"Raichu",r:"rara"},
    {d:27,s:"sandshrew",n:"Sandshrew",r:"comum"},
    {d:28,s:"sandslash",n:"Sandslash",r:"rara"},
    {d:29,s:"nidoran-f",n:"Nidoran♀",r:"comum"},
    {d:30,s:"nidorina",n:"Nidorina",r:"comum"},
    {d:31,s:"nidoqueen",n:"Nidoqueen",r:"rara"},
    {d:32,s:"nidoran-m",n:"Nidoran♂",r:"comum"},
    {d:33,s:"nidorino",n:"Nidorino",r:"comum"},
    {d:34,s:"nidoking",n:"Nidoking",r:"rara"},
    {d:35,s:"clefairy",n:"Clefairy",r:"comum"},
    {d:36,s:"clefable",n:"Clefable",r:"rara"},
    {d:37,s:"vulpix",n:"Vulpix",r:"comum"},
    {d:38,s:"ninetales",n:"Ninetales",r:"rara"},
    {d:39,s:"jigglypuff",n:"Jigglypuff",r:"comum"},
    {d:40,s:"wigglytuff",n:"Wigglytuff",r:"rara"},
    {d:41,s:"zubat",n:"Zubat",r:"comum"},
    {d:42,s:"golbat",n:"Golbat",r:"rara"},
    {d:43,s:"oddish",n:"Oddish",r:"comum"},
    {d:44,s:"gloom",n:"Gloom",r:"comum"},
    {d:45,s:"vileplume",n:"Vileplume",r:"rara"},
    {d:46,s:"paras",n:"Paras",r:"comum"},
    {d:47,s:"parasect",n:"Parasect",r:"rara"},
    {d:48,s:"venonat",n:"Venonat",r:"comum"},
    {d:49,s:"venomoth",n:"Venomoth",r:"rara"},
    {d:50,s:"diglett",n:"Diglett",r:"comum"},
    {d:51,s:"dugtrio",n:"Dugtrio",r:"rara"},
    {d:52,s:"meowth",n:"Meowth",r:"comum"},
    {d:53,s:"persian",n:"Persian",r:"rara"},
    {d:54,s:"psyduck",n:"Psyduck",r:"comum"},
    {d:55,s:"golduck",n:"Golduck",r:"rara"},
    {d:56,s:"mankey",n:"Mankey",r:"comum"},
    {d:57,s:"primeape",n:"Primeape",r:"rara"},
    {d:58,s:"growlithe",n:"Growlithe",r:"comum"},
    {d:59,s:"arcanine",n:"Arcanine",r:"rara"},
    {d:60,s:"poliwag",n:"Poliwag",r:"comum"},
    {d:61,s:"poliwhirl",n:"Poliwhirl",r:"comum"},
    {d:62,s:"poliwrath",n:"Poliwrath",r:"rara"},
    {d:63,s:"abra",n:"Abra",r:"comum"},
    {d:64,s:"kadabra",n:"Kadabra",r:"comum"},
    {d:65,s:"alakazam",n:"Alakazam",r:"especial"},
    {d:66,s:"machop",n:"Machop",r:"comum"},
    {d:67,s:"machoke",n:"Machoke",r:"comum"},
    {d:68,s:"machamp",n:"Machamp",r:"especial"},
    {d:69,s:"bellsprout",n:"Bellsprout",r:"comum"},
    {d:70,s:"weepinbell",n:"Weepinbell",r:"comum"},
    {d:71,s:"victreebel",n:"Victreebel",r:"rara"},
    {d:72,s:"tentacool",n:"Tentacool",r:"comum"},
    {d:73,s:"tentacruel",n:"Tentacruel",r:"rara"},
    {d:74,s:"geodude",n:"Geodude",r:"comum"},
    {d:75,s:"graveler",n:"Graveler",r:"comum"},
    {d:76,s:"golem",n:"Golem",r:"especial"},
    {d:77,s:"ponyta",n:"Ponyta",r:"comum"},
    {d:78,s:"rapidash",n:"Rapidash",r:"rara"},
    {d:79,s:"slowpoke",n:"Slowpoke",r:"comum"},
    {d:80,s:"slowbro",n:"Slowbro",r:"rara"},
    {d:81,s:"magnemite",n:"Magnemite",r:"comum"},
    {d:82,s:"magneton",n:"Magneton",r:"rara"},
    {d:83,s:"farfetchd",n:"Farfetch'd",r:"rara"},
    {d:84,s:"doduo",n:"Doduo",r:"comum"},
    {d:85,s:"dodrio",n:"Dodrio",r:"rara"},
    {d:86,s:"seel",n:"Seel",r:"comum"},
    {d:87,s:"dewgong",n:"Dewgong",r:"rara"},
    {d:88,s:"grimer",n:"Grimer",r:"comum"},
    {d:89,s:"muk",n:"Muk",r:"rara"},
    {d:90,s:"shellder",n:"Shellder",r:"comum"},
    {d:91,s:"cloyster",n:"Cloyster",r:"rara"},
    {d:92,s:"gastly",n:"Gastly",r:"comum"},
    {d:93,s:"haunter",n:"Haunter",r:"comum"},
    {d:94,s:"gengar",n:"Gengar",r:"especial"},
    {d:95,s:"onix",n:"Onix",r:"rara"},
    {d:96,s:"drowzee",n:"Drowzee",r:"comum"},
    {d:97,s:"hypno",n:"Hypno",r:"rara"},
    {d:98,s:"krabby",n:"Krabby",r:"comum"},
    {d:99,s:"kingler",n:"Kingler",r:"rara"},
    {d:100,s:"voltorb",n:"Voltorb",r:"comum"},
    {d:101,s:"electrode",n:"Electrode",r:"rara"},
    {d:102,s:"exeggcute",n:"Exeggcute",r:"comum"},
    {d:103,s:"exeggutor",n:"Exeggutor",r:"rara"},
    {d:104,s:"cubone",n:"Cubone",r:"comum"},
    {d:105,s:"marowak",n:"Marowak",r:"rara"},
    {d:106,s:"hitmonlee",n:"Hitmonlee",r:"rara"},
    {d:107,s:"hitmonchan",n:"Hitmonchan",r:"rara"},
    {d:108,s:"lickitung",n:"Lickitung",r:"rara"},
    {d:109,s:"koffing",n:"Koffing",r:"comum"},
    {d:110,s:"weezing",n:"Weezing",r:"rara"},
    {d:111,s:"rhyhorn",n:"Rhyhorn",r:"comum"},
    {d:112,s:"rhydon",n:"Rhydon",r:"rara"},
    {d:113,s:"chansey",n:"Chansey",r:"especial"},
    {d:114,s:"tangela",n:"Tangela",r:"rara"},
    {d:115,s:"kangaskhan",n:"Kangaskhan",r:"especial"},
    {d:116,s:"horsea",n:"Horsea",r:"comum"},
    {d:117,s:"seadra",n:"Seadra",r:"rara"},
    {d:118,s:"goldeen",n:"Goldeen",r:"comum"},
    {d:119,s:"seaking",n:"Seaking",r:"rara"},
    {d:120,s:"staryu",n:"Staryu",r:"comum"},
    {d:121,s:"starmie",n:"Starmie",r:"rara"},
    {d:122,s:"mr-mime",n:"Mr. Mime",r:"rara"},
    {d:123,s:"scyther",n:"Scyther",r:"especial"},
    {d:124,s:"jynx",n:"Jynx",r:"rara"},
    {d:125,s:"electabuzz",n:"Electabuzz",r:"rara"},
    {d:126,s:"magmar",n:"Magmar",r:"rara"},
    {d:127,s:"pinsir",n:"Pinsir",r:"especial"},
    {d:128,s:"tauros",n:"Tauros",r:"especial"},
    {d:129,s:"magikarp",n:"Magikarp",r:"comum"},
    {d:130,s:"gyarados",n:"Gyarados",r:"especial"},
    {d:131,s:"lapras",n:"Lapras",r:"especial"},
    {d:132,s:"ditto",n:"Ditto",r:"especial"},
    {d:133,s:"eevee",n:"Eevee",r:"comum"},
    {d:134,s:"vaporeon",n:"Vaporeon",r:"especial"},
    {d:135,s:"jolteon",n:"Jolteon",r:"especial"},
    {d:136,s:"flareon",n:"Flareon",r:"especial"},
    {d:137,s:"porygon",n:"Porygon",r:"especial"},
    {d:138,s:"omanyte",n:"Omanyte",r:"comum"},
    {d:139,s:"omastar",n:"Omastar",r:"rara"},
    {d:140,s:"kabuto",n:"Kabuto",r:"comum"},
    {d:141,s:"kabutops",n:"Kabutops",r:"rara"},
    {d:142,s:"aerodactyl",n:"Aerodactyl",r:"especial"},
    {d:143,s:"snorlax",n:"Snorlax",r:"especial"},
    {d:144,s:"articuno",n:"Articuno",r:"ultra_rara"},
    {d:145,s:"zapdos",n:"Zapdos",r:"ultra_rara"},
    {d:146,s:"moltres",n:"Moltres",r:"ultra_rara"},
    {d:147,s:"dratini",n:"Dratini",r:"comum"},
    {d:148,s:"dragonair",n:"Dragonair",r:"comum"},
    {d:149,s:"dragonite",n:"Dragonite",r:"ultra_rara"},
    {d:150,s:"mewtwo",n:"Mewtwo",r:"ultra_rara"},
    {d:151,s:"mew",n:"Mew",r:"ultra_rara"}
  ];

  const WP_RARITY_META = {
    comum:      { label: 'Comum',      color: '#9aa0c0', glow: 'none' },
    rara:       { label: 'Rara',       color: '#06d6a0', glow: '0 0 14px #06d6a066' },
    especial:   { label: 'Especial',   color: '#4cc9f0', glow: '0 0 18px #4cc9f088' },
    ultra_rara: { label: 'Ultra-rara', color: '#ffd166', glow: '0 0 24px #ffd166aa' },
  };

  // ── Pokébolas: tiers + chance de captura por raridade ─────────
  const WP_BALL_META = {
    pokeball:   { label: 'Poké Ball',   wobbles: 1, img: 'poke-ball' },
    greatball:  { label: 'Great Ball',  wobbles: 2, img: 'great-ball' },
    ultraball:  { label: 'Ultra Ball',  wobbles: 3, img: 'ultra-ball' },
    masterball: { label: 'Master Ball', wobbles: 1, img: 'master-ball' }, // sempre captura, sem drama
  };
  const WP_BALL_ORDER = ['pokeball', 'greatball', 'ultraball', 'masterball'];

  // [tier][raridade] = chance de sucesso (0-1)
  const WP_CATCH_RATES = {
    pokeball:   { comum: .90, rara: .35, especial: .10, ultra_rara: .02 },
    greatball:  { comum: .97, rara: .70, especial: .35, ultra_rara: .10 },
    ultraball:  { comum: .99, rara: .90, especial: .65, ultra_rara: .30 },
    masterball: { comum: 1,   rara: 1,   especial: 1,   ultra_rara: 1   },
  };

  // ── Mochila: stats individuais (01/09/2026) ─────────────────────
  // Cada captura bem-sucedida também vira 1 indivíduo em wild_backpack,
  // com 5 stats rolados no servidor (catch_wild_pokemon, ver
  // wild_backpack_setup.sql) — o client aqui só busca/exibe, nunca rola
  // nem edita stat nenhum.
  const WP_STAT_ORDER = ['hp', 'atk', 'def', 'spd', 'crit'];
  const WP_STAT_LABELS = { hp: 'HP', atk: 'Ataque', def: 'Defesa', spd: 'Agilidade', crit: 'Crítico' };
  const WP_BACKPACK_CAP_DEFAULT = 20; // só o valor inicial de exibição antes da 1ª resposta da RPC/consulta

  // Média dos 5 stats (04/09/2026, pedido do Eduardo) — soma os 5 e divide
  // por 5, um número só (0-100, mesma escala de cada stat individual) pra
  // dar uma ideia rápida de "quão bom" o indivíduo é no geral, sem precisar
  // ler as 5 barras uma por uma. Aparece no toast de captura (compacto) e
  // na janela de stats da mochila (maior/destacado).
  function wpStatAvg(entry) {
    const sum = WP_STAT_ORDER.reduce((acc, k) => acc + (entry[k] || 0), 0);
    return Math.round(sum / WP_STAT_ORDER.length);
  }

  // Desenha a pokébola em CSS (sem depender de imagem externa) — metade
  // colorida por tier + tarja preta + botão central, igual ao formato
  // real de cada bola (Great Ball com friso vermelho, Ultra com dourado,
  // Master roxa com botão rosa).
  function wpBallSpriteUrl(imgSlug) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${imgSlug}.png`;
  }
  function wpBallIconHtml(tier, size) {
    size = size || 26;
    const meta = WP_BALL_META[tier];
    return `<img class="wp-ball-icon" src="${wpBallSpriteUrl(meta.img)}" alt="${meta.label}" style="width:${size}px;height:${size}px">`;
  }

  function wpSpriteUrl(dex) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;
  }

  // ── Persistência local (teste — sem Supabase ainda) ────────────
  function wpLoadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (e) { return fallback; }
  }
  function wpSaveJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  // Dia local do usuário (não UTC) — é o que ele percebe como "hoje".
  function wpTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── Teto diário de Poké Ball por "ficar parado" (uso passivo do site) ──
  // Só conta o ganho automático (wpMaybeGrantBallFromUsage) — bolas dadas
  // na mão (console) ou por ações reais no futuro (leilão, etc.) não
  // passam por aqui e não são limitadas por isso.
  // localStorage continua sendo o cache rápido (funciona pra visitante
  // sem login também); pra quem está logado, isso é sincronizado com a
  // tabela wild_daily no Supabase (ver wpDbSaveDaily/wpSyncFromCloud
  // logo abaixo) pra não dar pra "resetar o teto" trocando de aparelho.
  function wpDailyBallsCount() {
    const s = wpLoadJSON(WP_STORAGE_DAILY_BALLS, { date: null, count: 0 });
    return s.date === wpTodayStr() ? s.count : 0;
  }
  function wpDailyBallsIncrement() {
    const today = wpTodayStr();
    wpSaveJSON(WP_STORAGE_DAILY_BALLS, { date: today, count: wpDailyBallsCount() + 1 });
    wpDbSaveDaily();
  }

  // ── Bônus de primeiro acesso do dia: 1 Great Ball ───────────────
  function wpCheckDailyLoginBonus() {
    const today = wpTodayStr();
    if (wpLoadJSON(WP_STORAGE_DAILY_BONUS, null) === today) return; // já deu hoje (neste aparelho, ou já sincronizado da conta)
    wpSaveJSON(WP_STORAGE_DAILY_BONUS, today);
    window.wpGrantBall('greatball', 1, 'primeiro acesso do dia');
    wpDbSaveDaily();
  }

  let wpCatches = wpLoadJSON(WP_STORAGE_CATCHES, {}); // { [slug]: { count, firstCaughtAt } }
  // saldo inicial de bolas pra já dar pra testar sem precisar chamar wpGrantBall na mão
  let wpBalls = wpLoadJSON(WP_STORAGE_BALLS, { pokeball: 5, greatball: 2, ultraball: 1, masterball: 0 });
  let wpSoundOn = wpLoadJSON(WP_STORAGE_SOUND, false);
  let wpEnabled = wpLoadJSON(WP_STORAGE_ENABLED, true);

  // Mochila — sem cache em localStorage (só existe pra quem está logado;
  // sempre vem fresca do Supabase, é a fonte da verdade). wpBackpackCap
  // é só o que a última resposta da RPC informou (ou o default acima
  // antes da 1ª captura/consulta).
  let wpBackpack = []; // [{ id, pokemon_slug, dex, rarity, hp, atk, def, spd, crit, exceptional, nickname, caught_at }]
  let wpBackpackCap = WP_BACKPACK_CAP_DEFAULT;
  let wpBackpackLoaded = false;

  // ── Batalhas (01/09/2026): Principal + Equipe de 3, sorteadas contra
  // outro jogador qualquer que também já tenha os dois definidos. Igual
  // à mochila, sem cache local — sempre busca fresco do Supabase.
  let wpLoadout = { principal_id: null, team_ids: [] };
  let wpLoadoutLoaded = false;
  let wpBattleBusy = false;

  // ── Sync com Supabase (conta do usuário) ────────────────────────
  // Mesmo padrão de segurança do xp_system.js: sbClient/currentUser são
  // const/let no topo de app.js, então window.sbClient NÃO funciona —
  // tem que checar o identificador direto (ver feedback_coding).
  function wpHasClient() { return typeof sbClient !== 'undefined' && !!sbClient; }
  function wpUid() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null; }

  // localStorage continua sendo o cache local pra UI responder na hora
  // (offline-first). Se logado, cada mudança também é espelhada no
  // Supabase em background (fire-and-forget, não trava a UI). Sem RPC
  // por enquanto — ver comentário no topo do wild_pokemon_setup.sql.
  function wpSaveCatches() {
    wpSaveJSON(WP_STORAGE_CATCHES, wpCatches);
  }
  function wpSaveBalls() {
    wpSaveJSON(WP_STORAGE_BALLS, wpBalls);
  }

  // Usada só pela reconciliação local↔nuvem em wpSyncFromCloud() (linha
  // ~397) pra não perder progresso de quem já jogava antes da migração
  // pra RPC — não é mais chamada na hora de capturar (isso agora é
  // catch_wild_pokemon(), ver wpThrowBall/wpResolveCatch acima e
  // xp_events_migration_23ago2026.sql). Escrever aqui NÃO concede XP —
  // a concessão de XP só acontece dentro da RPC, então nem editar
  // wild_catches manualmente pelo console dá pra farmar XP.
  function wpDbUpsertCatch(mon) {
    if (!wpHasClient() || !wpUid()) return;
    const rec = wpCatches[mon.s];
    sbClient.from('wild_catches').upsert({
      user_id: wpUid(),
      pokemon_slug: mon.s,
      dex: mon.d,
      rarity: mon.r,
      count: rec.count,
      first_caught_at: new Date(rec.firstCaughtAt).toISOString(),
      last_caught_at: new Date().toISOString(),
    }, { onConflict: 'user_id,pokemon_slug' }).then(({ error }) => {
      if (error) console.warn('[wp] falha ao salvar captura no Supabase:', error.message);
    });
  }

  function wpDbSaveBalls() {
    if (!wpHasClient() || !wpUid()) return;
    sbClient.from('wild_balls').upsert({
      user_id: wpUid(),
      pokeball: wpBalls.pokeball || 0,
      greatball: wpBalls.greatball || 0,
      ultraball: wpBalls.ultraball || 0,
      masterball: wpBalls.masterball || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).then(({ error }) => {
      if (error) console.warn('[wp] falha ao salvar pokébolas no Supabase:', error.message);
    });
  }

  // Teto de Poké Ball/dia + bônus de login, por CONTA (não mais só por
  // dispositivo) — evita logar em dois aparelhos e ganhar o bônus/teto
  // em dobro. Lê o que já está no localStorage (fonte imediata) e sobe
  // pra tabela wild_daily.
  function wpDbSaveDaily() {
    if (!wpHasClient() || !wpUid()) return;
    const today = wpTodayStr();
    const ballsState = wpLoadJSON(WP_STORAGE_DAILY_BALLS, { date: today, count: 0 });
    const bonusDate = wpLoadJSON(WP_STORAGE_DAILY_BONUS, null);
    sbClient.from('wild_daily').upsert({
      user_id: wpUid(),
      day: today,
      passive_balls: ballsState.date === today ? ballsState.count : 0,
      login_bonus_claimed: bonusDate === today,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).then(({ error }) => {
      if (error) console.warn('[wp] falha ao salvar contadores diários no Supabase:', error.message);
    });
  }

  // Puxa a coleção/inventário da nuvem quando o usuário está logado.
  // IMPORTANTE: não sobrescreve o localStorage às cegas — quem já
  // jogava antes dessa migração tem captura só local, então isso faz
  // um MERGE (maior contagem, menor first_caught_at) e sobe de volta
  // pro Supabase o que estava só local, em vez de simplesmente
  // substituir pelo que a nuvem tinha (que, na primeira sincronia, é
  // vazio, e apagaria o progresso local se sobrescrevesse). Sem
  // login, continua 100% localStorage (modo visitante).
  async function wpSyncFromCloud() {
    if (!wpHasClient() || !wpUid()) return; // visitante — só localStorage mesmo
    try {
      const [catchesRes, ballsRes, dailyRes] = await Promise.all([
        sbClient.from('wild_catches').select('pokemon_slug,count,first_caught_at').eq('user_id', wpUid()),
        sbClient.from('wild_balls').select('*').eq('user_id', wpUid()).maybeSingle(),
        sbClient.from('wild_daily').select('*').eq('user_id', wpUid()).maybeSingle(),
      ]);

      if (!catchesRes.error && catchesRes.data) {
        const cloudCatches = {};
        catchesRes.data.forEach(row => {
          cloudCatches[row.pokemon_slug] = { count: row.count, firstCaughtAt: new Date(row.first_caught_at).getTime() };
        });

        const merged = {};
        const toUpload = [];
        const allSlugs = new Set([...Object.keys(wpCatches), ...Object.keys(cloudCatches)]);
        allSlugs.forEach(slug => {
          const local = wpCatches[slug];
          const cloud = cloudCatches[slug];
          if (local && cloud) {
            const count = Math.max(local.count, cloud.count);
            const firstCaughtAt = Math.min(local.firstCaughtAt, cloud.firstCaughtAt);
            merged[slug] = { count, firstCaughtAt };
            if (count !== cloud.count || firstCaughtAt !== cloud.firstCaughtAt) toUpload.push(slug);
          } else if (local) {
            merged[slug] = local;
            toUpload.push(slug); // só existia local — sobe pra nuvem
          } else {
            merged[slug] = cloud;
          }
        });

        wpCatches = merged;
        wpSaveJSON(WP_STORAGE_CATCHES, wpCatches);

        toUpload.forEach(slug => {
          const mon = WP_KANTO151.find(m => m.s === slug);
          if (mon) wpDbUpsertCatch(mon);
        });
      }

      if (!ballsRes.error && ballsRes.data) {
        // Mesmo cuidado: se o saldo local (de antes da migração) for
        // maior que o da nuvem, mantém o maior em vez de sobrescrever
        // pra baixo — assim ninguém "perde" bolas que já tinha.
        const cloudBalls = {
          pokeball: ballsRes.data.pokeball || 0,
          greatball: ballsRes.data.greatball || 0,
          ultraball: ballsRes.data.ultraball || 0,
          masterball: ballsRes.data.masterball || 0,
        };
        const mergedBalls = {
          pokeball: Math.max(wpBalls.pokeball || 0, cloudBalls.pokeball),
          greatball: Math.max(wpBalls.greatball || 0, cloudBalls.greatball),
          ultraball: Math.max(wpBalls.ultraball || 0, cloudBalls.ultraball),
          masterball: Math.max(wpBalls.masterball || 0, cloudBalls.masterball),
        };
        wpBalls = mergedBalls;
        wpSaveJSON(WP_STORAGE_BALLS, wpBalls);
        if (JSON.stringify(mergedBalls) !== JSON.stringify(cloudBalls)) wpDbSaveBalls();
      } else if (!ballsRes.error && !ballsRes.data) {
        // primeira vez desse usuário logado — cria a linha na nuvem com o saldo atual
        wpDbSaveBalls();
      }

      // Teto diário de Poké Ball + bônus de login — por CONTA agora, não
      // mais só por dispositivo. Se a nuvem já tem um registro de HOJE,
      // funde com o que está no localStorage (o maior valor de cada,
      // "já reclamado" vence "não reclamado") pra ninguém dobrar o teto
      // ou o bônus logando em outro aparelho. Se o dia da nuvem for
      // diferente de hoje (ou não existir linha ainda), é dia novo — o
      // local já começa zerado e o primeiro grant/bônus cria a linha.
      if (!dailyRes.error && dailyRes.data && dailyRes.data.day === wpTodayStr()) {
        const today = wpTodayStr();
        const localBalls = wpDailyBallsCount();
        const localBonus = wpLoadJSON(WP_STORAGE_DAILY_BONUS, null) === today;
        const cloudBalls = dailyRes.data.passive_balls || 0;
        const cloudBonus = !!dailyRes.data.login_bonus_claimed;

        const mergedBalls = Math.max(localBalls, cloudBalls);
        const mergedBonus = localBonus || cloudBonus;

        wpSaveJSON(WP_STORAGE_DAILY_BALLS, { date: today, count: mergedBalls });
        if (mergedBonus) wpSaveJSON(WP_STORAGE_DAILY_BONUS, today);

        if (mergedBalls !== cloudBalls || mergedBonus !== cloudBonus) wpDbSaveDaily();
      }

      wpUpdateBadge();
    } catch (e) {
      console.warn('[wp] falha ao sincronizar com Supabase:', e);
    }
  }

  // ── Mochila: busca/libera/renomeia (sempre via Supabase — sem
  // fallback local, porque sem login não faz sentido ter mochila) ────
  async function wpFetchBackpack() {
    if (!wpHasClient() || !wpUid()) { wpBackpack = []; wpBackpackLoaded = true; return; }
    const { data, error } = await sbClient
      .from('wild_backpack')
      .select('id,pokemon_slug,dex,rarity,hp,atk,def,spd,crit,exceptional,nickname,caught_at')
      .eq('user_id', wpUid())
      .order('caught_at', { ascending: false });
    if (error) { console.warn('[wp] falha ao buscar mochila:', error.message); return; }
    wpBackpack = data || [];
    wpBackpackLoaded = true;
    wpUpdateBadge();
  }

  async function wpReleaseBackpack(id) {
    if (!wpHasClient() || !wpUid()) return false;
    const { data, error } = await sbClient.rpc('release_wild_pokemon', { p_backpack_id: id });
    if (error) { console.warn('[wp] falha ao liberar:', error.message); return false; }
    if (data) wpBackpack = wpBackpack.filter(b => b.id !== id);
    wpUpdateBadge();
    return !!data;
  }

  async function wpRenameBackpack(id, nickname) {
    if (!wpHasClient() || !wpUid()) return false;
    const { data, error } = await sbClient.rpc('rename_wild_pokemon', { p_backpack_id: id, p_nickname: nickname });
    if (error) { console.warn('[wp] falha ao renomear:', error.message); return false; }
    const rec = wpBackpack.find(b => b.id === id);
    if (rec) rec.nickname = (nickname || '').trim() || null;
    return !!data;
  }

  function wpBackpackDisplayName(entry) {
    if (entry.nickname) return entry.nickname;
    const mon = WP_KANTO151.find(m => m.s === entry.pokemon_slug);
    return mon ? mon.n : entry.pokemon_slug;
  }

  // ── Loadout: Principal + Equipe ─────────────────────────────────
  async function wpFetchLoadout() {
    if (!wpHasClient() || !wpUid()) { wpLoadout = { principal_id: null, team_ids: [] }; wpLoadoutLoaded = true; return; }
    const { data, error } = await sbClient
      .from('wild_loadout')
      .select('principal_id,team_ids,wins,losses')
      .eq('user_id', wpUid())
      .maybeSingle();
    if (error) { console.warn('[wp] falha ao buscar loadout:', error.message); return; }
    wpLoadout = data || { principal_id: null, team_ids: [] };
    wpLoadoutLoaded = true;
    wpUpdateArenaButton();
  }

  function wpLoadoutReady() {
    return !!wpLoadout.principal_id && (wpLoadout.team_ids || []).length === 3;
  }

  async function wpSetLoadout(principalId, teamIds) {
    if (!wpHasClient() || !wpUid()) return false;
    const { data, error } = await sbClient.rpc('set_wild_loadout', { p_principal_id: principalId, p_team_ids: teamIds });
    if (error) { wpToastRaw('⚠️', error.message, false); return false; }
    wpLoadout.principal_id = data.principal_id;
    wpLoadout.team_ids = data.team_ids || [];
    wpUpdateArenaButton();
    return true;
  }

  async function wpTogglePrincipal(entryId) {
    const next = wpLoadout.principal_id === entryId ? null : entryId;
    const ok = await wpSetLoadout(next, wpLoadout.team_ids);
    if (ok) wpToastRaw('⭐', next ? 'Definido como Principal.' : 'Não é mais o Principal.', true);
    return ok;
  }

  async function wpToggleTeamMember(entryId) {
    const cur = wpLoadout.team_ids || [];
    if (cur.includes(entryId)) {
      return wpSetLoadout(wpLoadout.principal_id, cur.filter(id => id !== entryId));
    }
    if (cur.length >= 3) {
      wpToastRaw('🛡️', 'Sua equipe já tem 3 — tire alguém antes de adicionar outro.', false);
      return false;
    }
    const ok = await wpSetLoadout(wpLoadout.principal_id, [...cur, entryId]);
    if (ok) wpToastRaw('🛡️', 'Adicionado à Equipe.', true);
    return ok;
  }

  // ── Som (Web Audio API — sem depender de arquivo externo) ─────
  let wpAudioCtx = null;
  function wpAudio() {
    if (!wpSoundOn) return null;
    if (!wpAudioCtx) {
      try { wpAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    return wpAudioCtx;
  }
  function wpBeep(freq, startOffset, dur, type, gainPeak) {
    const ctx = wpAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak ?? 0.12, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function wpSoundSpawn() { wpBeep(880, 0, 0.15, 'triangle', 0.08); }
  function wpSoundWobble() { wpBeep(220, 0, 0.12, 'square', 0.07); }
  function wpSoundCatch() { wpBeep(523, 0, 0.12); wpBeep(659, 0.12, 0.12); wpBeep(784, 0.24, 0.28); }
  function wpSoundFlee() { wpBeep(300, 0, 0.1, 'sawtooth', 0.08); wpBeep(180, 0.1, 0.25, 'sawtooth', 0.08); }
  function wpSoundBall() { wpBeep(660, 0, 0.08, 'triangle', 0.06); wpBeep(990, 0.08, 0.14, 'triangle', 0.06); }
  function wpSoundHit(crit) { wpBeep(crit ? 200 : 140, 0, crit ? 0.18 : 0.1, 'square', crit ? 0.12 : 0.08); }
  function wpSoundVictory() { wpBeep(523, 0, 0.12); wpBeep(659, 0.12, 0.12); wpBeep(784, 0.24, 0.12); wpBeep(1047, 0.36, 0.3); }
  function wpSoundDefeat() { wpBeep(400, 0, 0.2, 'sawtooth', 0.08); wpBeep(280, 0.2, 0.2, 'sawtooth', 0.08); wpBeep(180, 0.4, 0.4, 'sawtooth', 0.08); }

  // ── CSS ──────────────────────────────────────────────────────
  const wpStyle = document.createElement('style');
  wpStyle.textContent = `
    .wp-spawn {
      position: fixed;
      z-index: 9998;
      width: 84px; height: 84px;
      cursor: pointer;
      filter: drop-shadow(0 4px 14px rgba(0,0,0,.55));
      transition: transform .35s cubic-bezier(.34,1.56,.64,1);
      touch-action: manipulation;
    }
    .wp-spawn img { position: relative; z-index: 2; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
    .wp-aura { position: absolute; inset: -20px; border-radius: 50%; pointer-events: none; z-index: 0; filter: blur(7px); }
    .wp-aura-rara { background: radial-gradient(circle, #06d6a077 0%, transparent 68%); animation: wpAuraPulse 2.4s ease-in-out infinite; }
    .wp-aura-especial { background: radial-gradient(circle, #4cc9f099 0%, transparent 68%); animation: wpAuraPulse 1.9s ease-in-out infinite; }
    .wp-aura-ultra_rara { background: radial-gradient(circle, #ffd166cc 0%, transparent 68%); animation: wpAuraPulse 1.1s ease-in-out infinite; }
    @keyframes wpAuraPulse {
      0%, 100% { transform: scale(.82); opacity: .45; }
      50%      { transform: scale(1.18); opacity: .9; }
    }
    .wp-ring { position: absolute; inset: -11px; border-radius: 50%; pointer-events: none; z-index: 1; border: 2px solid transparent; }
    .wp-ring-especial { border-top-color: #4cc9f0; border-right-color: #4cc9f055; animation: wpRingSpin 3s linear infinite; }
    .wp-ring-ultra_rara { border-top-color: #ffd166; border-right-color: #ffd16688; border-bottom-color: #ffd16633; animation: wpRingSpin 1.5s linear infinite; }
    @keyframes wpRingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .wp-sparkles { position: absolute; inset: -14px; pointer-events: none; z-index: 1; }
    .wp-sparkles span {
      position: absolute; width: 4px; height: 4px; border-radius: 50%;
      background: #fff8d6; box-shadow: 0 0 7px 2px #ffd166cc;
      animation: wpTwinkle 1.3s ease-in-out infinite;
    }
    @keyframes wpTwinkle {
      0%, 100% { opacity: 0; transform: scale(.3); }
      50%      { opacity: 1; transform: scale(1); }
    }
    .wp-spawn.wp-bl { left: -78px; bottom: 18px; }
    .wp-spawn.wp-br { right: -78px; bottom: 18px; }
    .wp-spawn.wp-tl { left: -78px; top: 90px; }
    .wp-spawn.wp-in.wp-bl { transform: translateX(86px); }
    .wp-spawn.wp-in.wp-br { transform: translateX(-86px); }
    .wp-spawn.wp-in.wp-tl { transform: translateX(86px); }
    .wp-spawn.wp-peek { animation: wpPeek 1.6s ease-in-out infinite; }
    @keyframes wpPeek {
      0%, 100% { transform: translateX(var(--wpx,86px)) translateY(0) rotate(0deg); }
      50%      { transform: translateX(var(--wpx,86px)) translateY(-10px) rotate(-5deg); }
    }
    .wp-spawn.wp-shy { animation: wpShy .5s ease-out forwards; }
    @keyframes wpShy {
      0%   { transform: translateX(var(--wpx,86px)); }
      100% { transform: translateX(calc(var(--wpx,86px) * .35)); }
    }
    .wp-spawn.wp-caught { animation: wpCaught .5s ease-out forwards; }
    @keyframes wpCaught {
      0%   { transform: scale(1); opacity: 1; }
      60%  { transform: scale(1.3); opacity: .8; }
      100% { transform: scale(0); opacity: 0; }
    }
    .wp-spawn.wp-fled { animation: wpFled .55s ease-in forwards; }
    @keyframes wpFled {
      0%   { transform: translateX(var(--wpx,86px)) scale(1); opacity: 1; }
      100% { transform: translateX(calc(var(--wpx,86px) * 3)) scale(.4); opacity: 0; }
    }
    .wp-glow { position: absolute; inset: -6px; border-radius: 50%; pointer-events: none; }
    .wp-ballpicker {
      position: fixed; z-index: 9999;
      background: linear-gradient(135deg, #111422, #181c2e);
      border: 1px solid #52597a55; border-radius: 14px;
      padding: 10px; display: flex; gap: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,.55);
    }
    .wp-ball-btn {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      background: #0d0f18; border: 1px solid #ffffff14; border-radius: 10px;
      padding: 8px 10px; cursor: pointer; color: #f2f2f2;
      font-family: 'DM Sans', sans-serif; font-size: 11px;
      transition: border-color .15s, transform .15s;
    }
    .wp-ball-btn:hover:not(.wp-ball-disabled) { border-color: #ffd166aa; transform: translateY(-2px); }
    .wp-ball-btn .wp-ball-qty { font-family: 'Space Mono', monospace; color: #9aa0c0; }
    .wp-ball-disabled { opacity: .3; cursor: not-allowed; }
    .wp-ball-icon { object-fit: contain; filter: drop-shadow(0 1px 3px rgba(0,0,0,.5)); }
    .wp-badge .wp-ball-icon { vertical-align: -3px; }
    .wp-thrown-ball {
      position: fixed; z-index: 9999; pointer-events: none;
      transition: left .4s cubic-bezier(.3,.6,.4,1), top .4s cubic-bezier(.3,.6,.4,1);
    }
    .wp-thrown-ball.wp-wobble { animation: wpWobble .35s ease-in-out; }
    @keyframes wpWobble {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-18deg); }
      75% { transform: rotate(18deg); }
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
      max-width: 88vw;
    }
    .wp-toast.wp-show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .wp-toast img { width: 34px; height: 34px; object-fit: contain; }
    .wp-toast b { font-family: 'Bebas Neue', sans-serif; letter-spacing: .5px; }
    .wp-toast.wp-fail { border-color: #e6394666; }
    .wp-toast.wp-fail b { color: #e63946; }
    .wp-toast-avg {
      display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px;
      background: #ffd16622; border: 1px solid #ffd16666; color: #ffd166;
      font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; white-space: nowrap;
    }
    .wp-badge {
      position: fixed; left: 14px; bottom: 14px; z-index: 9997;
      background: #111422; border: 1px solid #52597a55;
      color: #f2f2f2; font-family: 'Space Mono', monospace; font-size: 12.5px;
      padding: 8px 12px; border-radius: 999px;
      display: flex; align-items: center; gap: 10px;
      cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.4);
    }
    .wp-badge:hover { border-color: #ffd166aa; }
    .wp-badge .wp-sound-btn, .wp-badge .wp-power-btn { cursor: pointer; opacity: .7; }
    .wp-badge .wp-sound-btn:hover, .wp-badge .wp-power-btn:hover { opacity: 1; }
    .wp-badge.wp-badge-off { opacity: .55; }
    .wp-badge.wp-badge-off .wp-power-btn { opacity: 1; }
    /* 29/08/2026: sobe acima da .mnav (barra inferior fixa do menu mobile
       novo) — senão a bolinha ficava atrás/colada nela no celular. */
    @media (max-width: 900px) {
      .wp-badge { bottom: calc(66px + env(safe-area-inset-bottom, 0px)); }
    }
    .wp-modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 10001;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .wp-modal {
      background: #0d0f18; border: 1px solid #52597a44; border-radius: 16px;
      max-width: 640px; width: 100%; max-height: 84vh; overflow-y: auto;
      padding: 22px; font-family: 'DM Sans', sans-serif; color: #f2f2f2;
    }
    .wp-modal h3 { font-family: 'Bebas Neue', sans-serif; letter-spacing: .5px; font-size: 24px; margin: 0 0 4px; color: #ffd166; }
    .wp-modal .wp-sub { color: #9aa0c0; font-size: 13px; margin-bottom: 14px; }
    .wp-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
    .wp-tab { background: #111422; border: 1px solid #ffffff14; border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 13px; color: #9aa0c0; }
    .wp-tab.wp-tab-active { color: #ffd166; border-color: #ffd16655; }
    .wp-inv-row { display: flex; align-items: center; gap: 12px; background: #111422; border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; }
    .wp-inv-row .wp-inv-label { flex: 1; font-size: 14px; }
    .wp-inv-row .wp-inv-qty { font-family: 'Space Mono', monospace; font-size: 16px; color: #ffd166; }
    .wp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 10px; }
    .wp-cell { background: #111422; border-radius: 10px; padding: 8px; text-align: center; border: 1px solid #ffffff0d; }
    .wp-cell img { width: 48px; height: 48px; object-fit: contain; opacity: .25; filter: grayscale(1); }
    .wp-cell.wp-got img { opacity: 1; filter: none; }
    .wp-cell .wp-n { font-size: 10px; margin-top: 4px; color: #9aa0c0; }
    .wp-cell.wp-got .wp-n { color: #06d6a0; }
    .wp-cell .wp-r { font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; }
    .wp-close { float: right; background: none; border: none; color: #9aa0c0; font-size: 20px; cursor: pointer; }

    /* ── Mochila ──────────────────────────────────────────────── */
    .wp-bp-cell { cursor: pointer; position: relative; transition: transform .15s, border-color .15s; }
    .wp-bp-cell:hover { transform: translateY(-2px); border-color: #ffd16655; }
    .wp-bp-cell img { opacity: 1; filter: none; }
    .wp-bp-cell .wp-bp-nick { font-size: 10px; margin-top: 4px; color: #f2f2f2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wp-bp-cell.wp-bp-exceptional { border-color: #ffd166aa; box-shadow: 0 0 14px #ffd16655; }
    .wp-bp-exceptional-tag { position: absolute; top: 2px; right: 4px; font-size: 12px; }
    .wp-bp-empty { color: #9aa0c0; font-size: 13px; text-align: center; padding: 20px 10px; }
    .wp-statbar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .wp-statbar-label { width: 68px; font-size: 12px; color: #9aa0c0; flex-shrink: 0; }
    .wp-statbar-track { flex: 1; height: 8px; background: #181c2e; border-radius: 4px; overflow: hidden; }
    .wp-statbar-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #06d6a0, #4cc9f0); }
    .wp-statbar-val { width: 28px; text-align: right; font-family: 'Space Mono', monospace; font-size: 12px; color: #f2f2f2; }
    .wp-bp-avg-card {
      display: flex; align-items: center; justify-content: space-between;
      background: linear-gradient(135deg, #ffd16622, #4cc9f022);
      border: 1px solid #ffd16655; border-radius: 10px;
      padding: 10px 16px; margin-bottom: 14px;
    }
    .wp-bp-avg-label { font-family: 'DM Sans', sans-serif; font-size: 13px; color: #f2f2f2; font-weight: 700; }
    .wp-bp-avg-val { font-family: 'Bebas Neue', sans-serif; font-size: 30px; letter-spacing: 1px; color: #ffd166; }
    .wp-bp-detail-head { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
    .wp-bp-detail-head img { width: 72px; height: 72px; object-fit: contain; }
    .wp-bp-nick-input {
      background: #111422; border: 1px solid #52597a55; border-radius: 8px; color: #f2f2f2;
      font-family: 'DM Sans', sans-serif; font-size: 14px; padding: 6px 10px; width: 100%; margin-top: 4px;
    }
    .wp-bp-nick-input:focus { outline: none; border-color: #ffd16688; }
    .wp-bp-actions { display: flex; gap: 8px; margin-top: 16px; }
    .wp-bp-btn {
      flex: 1; text-align: center; padding: 10px; border-radius: 10px; cursor: pointer;
      font-family: 'DM Sans', sans-serif; font-size: 13px; border: 1px solid #ffffff14; background: #111422; color: #f2f2f2;
    }
    .wp-bp-btn:hover { border-color: #ffffff33; }
    .wp-bp-btn-danger { color: #e63946; }
    .wp-bp-btn-danger.wp-bp-confirm { background: #e6394622; border-color: #e6394666; }
    .wp-bp-btn-back { flex: 0 0 auto; padding: 10px 14px; }
    .wp-bp-full-banner {
      background: #ffd16618; border: 1px solid #ffd16655; border-radius: 10px; padding: 10px 14px;
      font-size: 13px; margin-bottom: 12px; color: #ffd166;
    }
    .wp-bp-tag-row { display: flex; gap: 6px; margin-top: 8px; }
    .wp-bp-tag-btn {
      flex: 1; text-align: center; padding: 8px; border-radius: 10px; cursor: pointer; font-size: 12px;
      border: 1px solid #ffffff14; background: #111422; color: #9aa0c0;
    }
    .wp-bp-tag-btn.wp-bp-tag-active { border-color: #ffd166aa; color: #ffd166; background: #ffd16614; }
    .wp-bp-cell-tags { position: absolute; top: 2px; left: 4px; font-size: 11px; display: flex; gap: 2px; }

    /* ── Arena (batalhas) ─────────────────────────────────────── */
    .wp-arena-btn {
      position: fixed; left: 14px; bottom: 64px; z-index: 9997;
      background: linear-gradient(135deg, #2a0f14, #111422); border: 1px solid #e6394666;
      color: #f2f2f2; font-family: 'Space Mono', monospace; font-size: 12.5px;
      padding: 8px 14px; border-radius: 999px; cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,.4); transition: border-color .15s, transform .15s;
    }
    .wp-arena-btn:hover { border-color: #e63946; transform: translateY(-2px); }
    .wp-arena-btn.wp-arena-disabled { opacity: .55; }
    @media (max-width: 900px) {
      .wp-arena-btn { bottom: calc(116px + env(safe-area-inset-bottom, 0px)); }
    }
    .wp-battle-modal { max-width: 460px; }
    .wp-battle-format { text-align: center; color: #9aa0c0; font-size: 12px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .wp-battle-duel { margin-bottom: 22px; }
    .wp-battle-vs { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .wp-battle-side { flex: 1; text-align: center; }
    .wp-battle-side img { width: 56px; height: 56px; object-fit: contain; transition: transform .15s, filter .15s; }
    .wp-battle-side.wp-battle-hit img { transform: scale(.85); filter: brightness(1.6); }
    .wp-battle-vs-label { font-family: 'Bebas Neue', sans-serif; color: #52597a; font-size: 18px; }
    .wp-battle-hpbar-track { height: 10px; background: #181c2e; border-radius: 5px; overflow: hidden; margin-top: 6px; }
    .wp-battle-hpbar-fill { height: 100%; background: linear-gradient(90deg, #06d6a0, #4cc9f0); transition: width .35s ease; }
    .wp-battle-hpbar-fill.wp-battle-low { background: linear-gradient(90deg, #e63946, #ffd166); }
    .wp-battle-dmg { font-family: 'Space Mono', monospace; font-size: 12px; color: #e63946; height: 16px; margin-top: 2px; }
    .wp-battle-dmg.wp-battle-crit { color: #ffd166; font-weight: 700; }
    .wp-battle-duel-result { text-align: center; font-size: 12px; color: #9aa0c0; margin-top: 4px; }
    .wp-battle-banner { text-align: center; padding: 16px; border-radius: 12px; margin-top: 6px; font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: .5px; }
    .wp-battle-banner.wp-win { background: #06d6a022; border: 1px solid #06d6a066; color: #06d6a0; }
    .wp-battle-banner.wp-lose { background: #e6394622; border: 1px solid #e6394666; color: #e63946; }
    .wp-battle-record { text-align: center; font-size: 12px; color: #9aa0c0; margin-top: 6px; }
  `;
  document.head.appendChild(wpStyle);

  // ── Spawn engine ─────────────────────────────────────────────
  let wpActiveEl = null;
  let wpActiveMon = null;
  let wpActiveTimeoutId = null;
  const WP_CORNERS = ['wp-bl', 'wp-br', 'wp-tl'];

  // ── Cadência por dia (pedido do Eduardo, 18/08) ────────────────
  // "normais" (comum) 240x/dia, "raros" 120x/dia, "super raro" 24x/dia.
  // O bucket "raros" do pedido cobre as raridades rara+especial do
  // catálogo (que continuam distintas pra chance de captura/bola) —
  // dividido entre elas na proporção de quantas espécies cada uma tem
  // (54 rara : 21 especial) pra não desbalancear a distribuição.
  const WP_DAILY_TARGETS = { comum: 240, rara: 86, especial: 34, ultra_rara: 24 }; // soma = 384/dia
  const WP_DAILY_TOTAL = Object.values(WP_DAILY_TARGETS).reduce((a, b) => a + b, 0);
  const WP_DAY_MS = 24 * 60 * 60 * 1000;
  const WP_TEST_DAY_COMPRESS_MS = 20 * 60 * 1000; // no modo teste, "1 dia" cabe em 20min pra validar rápido

  function wpPickMon() {
    const totalWeight = WP_KANTO151.reduce((sum, m) => sum + WP_DAILY_TARGETS[m.r], 0);
    let roll = Math.random() * totalWeight;
    for (const m of WP_KANTO151) {
      roll -= WP_DAILY_TARGETS[m.r];
      if (roll <= 0) return m;
    }
    return WP_KANTO151[0];
  }

  // Aura visual por raridade — comum não tem nada (fica "normal" mesmo),
  // rara tem brilho verde suave, especial ganha um anel giratório azul,
  // ultra-rara ganha anel dourado mais rápido + partículas brilhando.
  // Dá uma pista visual da raridade sem revelar o nome (continua "???").
  function wpAuraHtml(r) {
    if (r === 'comum') return '';
    let html = `<div class="wp-aura wp-aura-${r}"></div>`;
    if (r === 'especial' || r === 'ultra_rara') html += `<div class="wp-ring wp-ring-${r}"></div>`;
    if (r === 'ultra_rara') {
      const sparkles = Array.from({ length: 6 }, () => {
        const top = Math.round(Math.random() * 84);
        const left = Math.round(Math.random() * 84);
        const delay = (Math.random() * 1.2).toFixed(2);
        return `<span style="top:${top}%;left:${left}%;animation-delay:${delay}s"></span>`;
      }).join('');
      html += `<div class="wp-sparkles">${sparkles}</div>`;
    }
    return html;
  }

  function wpSpawn(chance) {
    if (!wpEnabled) return; // minigame desligado pelo usuário
    if (wpActiveEl) return; // só 1 por vez na tela
    if (Math.random() > chance) return;

    const mon = wpPickMon();
    const corner = WP_CORNERS[Math.floor(Math.random() * WP_CORNERS.length)];

    const el = document.createElement('div');
    el.className = `wp-spawn ${corner}`;
    el.innerHTML = `${wpAuraHtml(mon.r)}<img src="${wpSpriteUrl(mon.d)}" alt="${mon.n}">`;
    el.title = '???';
    document.body.appendChild(el);
    wpActiveEl = el;
    wpActiveMon = mon;

    requestAnimationFrame(() => { el.classList.add('wp-in', 'wp-peek'); });
    wpSoundSpawn();

    // foge sozinho se o mouse chegar perto sem clicar (só pra rara+)
    if (mon.r !== 'comum') {
      el.addEventListener('mouseenter', () => {
        if (el !== wpActiveEl) return;
        el.classList.remove('wp-peek');
        el.classList.add('wp-shy');
      }, { once: true });
    }

    wpActiveTimeoutId = setTimeout(() => wpDespawn(el), WP_LIFETIME_MS);

    el.addEventListener('click', (ev) => {
      wpOpenBallPicker(ev, mon, el);
    });
  }

  function wpDespawn(el) {
    if (!el || el !== wpActiveEl) return;
    el.classList.remove('wp-in', 'wp-peek', 'wp-shy');
    setTimeout(() => { el.remove(); }, 400);
    wpActiveEl = null;
    wpActiveMon = null;
  }

  // ── Seletor de pokébola ─────────────────────────────────────
  function wpOpenBallPicker(ev, mon, el) {
    document.querySelectorAll('.wp-ballpicker').forEach(n => n.remove());

    const totalBalls = WP_BALL_ORDER.reduce((s, t) => s + (wpBalls[t] || 0), 0);
    if (totalBalls === 0) {
      wpToastRaw('🎒', 'Sem pokébolas! Use o site pra ganhar mais.', false);
      return;
    }

    const rect = el.getBoundingClientRect();
    const picker = document.createElement('div');
    picker.className = 'wp-ballpicker';
    const isLeft = rect.left < window.innerWidth / 2;
    picker.style.bottom = `${window.innerHeight - rect.top + 10}px`;
    if (isLeft) picker.style.left = `${Math.max(8, rect.left)}px`;
    else picker.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;

    picker.innerHTML = WP_BALL_ORDER.map(tier => {
      const qty = wpBalls[tier] || 0;
      const disabled = qty <= 0;
      return `<div class="wp-ball-btn ${disabled ? 'wp-ball-disabled' : ''}" data-tier="${tier}">
        ${wpBallIconHtml(tier, 24)}
        <span class="wp-ball-qty">${qty}</span>
      </div>`;
    }).join('');
    document.body.appendChild(picker);

    const closePicker = () => picker.remove();
    setTimeout(() => document.addEventListener('click', function onDoc(e) {
      if (!picker.contains(e.target)) { closePicker(); document.removeEventListener('click', onDoc); }
    }), 0);

    picker.querySelectorAll('.wp-ball-btn:not(.wp-ball-disabled)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePicker();
        wpThrowBall(btn.dataset.tier, mon, el);
      });
    });
  }

  // ── Arremesso + suspense (treme e resolve) ──────────────────
  // MIGRAÇÃO 23/08/2026: quem decide se capturou não é mais o
  // Math.random() daqui do client — é o servidor (RPC
  // catch_wild_pokemon, ver xp_events_migration_23ago2026.sql). Isso
  // fecha o mesmo buraco que o comentário do topo deste arquivo (e do
  // wild_pokemon_setup.sql) já avisava: sem isso, dava pra abrir o
  // console e forçar sucesso/XP à vontade. O client só toca a
  // animação de suspense (bola tremendo) — o resultado que ela revela
  // no fim já veio pronto do banco. A RPC também é quem debita a
  // pokébola agora (não mais escrita direta em wild_balls daqui).
  function wpThrowBall(tier, mon, el) {
    if (el !== wpActiveEl || mon !== wpActiveMon) return; // já sumiu/mudou
    clearTimeout(wpActiveTimeoutId);
    wpActiveEl = null; // trava novo spawn enquanto resolve

    // Feedback visual otimista (bola sumindo do inventário) — o saldo
    // real e definitivo vem no retorno da RPC, mais abaixo.
    wpBalls[tier] = Math.max(0, (wpBalls[tier] || 0) - 1);
    wpUpdateBadge();
    wpSoundBall();

    const rect = el.getBoundingClientRect();
    const ballEl = document.createElement('div');
    ballEl.className = 'wp-thrown-ball';
    ballEl.innerHTML = wpBallIconHtml(tier, 28);
    ballEl.style.left = `${rect.left + rect.width / 2 - 15}px`;
    ballEl.style.top = `${rect.top + rect.height / 2 - 15}px`;
    document.body.appendChild(ballEl);

    requestAnimationFrame(() => {
      ballEl.style.left = `${rect.left + rect.width / 2 - 15}px`;
      ballEl.style.top = `${rect.top + rect.height / 2 - 8}px`;
    });

    // Dispara a RPC já de cara (em paralelo com a animação de
    // suspense) — na maioria das vezes a resposta já está pronta
    // quando os tremores acabam. Sem login (visitante) ou sem client,
    // cai num sorteio local só decorativo — não persiste nada, não dá XP.
    let resultPromise;
    if (wpHasClient() && wpUid()) {
      resultPromise = sbClient.rpc('catch_wild_pokemon', {
        p_pokemon_slug: mon.s, p_dex: mon.d, p_rarity: mon.r, p_tier: tier,
      }).then(({ data, error }) => {
        if (error) { console.warn('[wp] catch_wild_pokemon falhou:', error.message); return { error: error.message }; }
        return data; // { success, balls, count, total_xp, level }
      }).catch(e => {
        console.warn('[wp] catch_wild_pokemon — falha de conexão:', e);
        return { error: 'conexão' };
      });
    } else {
      const chance = WP_CATCH_RATES[tier][mon.r];
      resultPromise = Promise.resolve({ success: Math.random() < chance, balls: null });
    }

    const wobbles = tier === 'masterball' ? 1 : WP_BALL_META[tier].wobbles;

    el.classList.remove('wp-peek', 'wp-shy');

    let i = 0;
    const wobbleStep = () => {
      i++;
      ballEl.classList.remove('wp-wobble');
      void ballEl.offsetWidth; // reflow pra reiniciar a animação
      ballEl.classList.add('wp-wobble');
      wpSoundWobble();
      if (i < wobbles) {
        setTimeout(wobbleStep, 420);
      } else {
        setTimeout(async () => {
          const result = await resultPromise;
          wpResolveCatch(result, mon, el, ballEl, tier);
        }, 420);
      }
    };
    setTimeout(wobbleStep, 500);
  }

  function wpResolveCatch(result, mon, el, ballEl, tier) {
    ballEl.remove();

    if (result.error) {
      // Não deu pra confirmar com o servidor (rede caiu no meio) — não
      // creditamos nada às cegas. Devolve a bola visualmente (o
      // decremento otimista foi só de tela, a RPC não chegou a debitar
      // de verdade nesse caso) e avisa, sem fingir captura nem fuga.
      wpBalls[tier] = (wpBalls[tier] || 0) + 1;
      wpUpdateBadge();
      el.classList.remove('wp-fled', 'wp-caught');
      wpToastRaw('⚠️', 'Não deu pra confirmar agora — sua bola não foi gasta, tente de novo.', false);
      wpActiveMon = null;
      return;
    }

    // Saldo real de bolas, direto do servidor (substitui o otimista).
    if (result.balls) {
      wpBalls = result.balls;
      wpSaveBalls();
    }
    wpUpdateBadge();

    if (result.success) {
      wpCatches[mon.s] = wpCatches[mon.s] || { count: 0 };
      wpCatches[mon.s].count = result.count || (wpCatches[mon.s].count + 1);
      wpCatches[mon.s].firstCaughtAt = wpCatches[mon.s].firstCaughtAt || Date.now();
      wpSaveCatches();

      // Mochila — o indivíduo já rolado/persistido volta pronto no
      // mesmo retorno da RPC (ver wild_backpack_setup.sql); só
      // atualiza o cache local, sem rolar nem inserir nada daqui.
      if (result.backpack_entry) {
        wpBackpack.unshift({
          id: result.backpack_entry.id, pokemon_slug: mon.s, dex: mon.d, rarity: mon.r,
          hp: result.backpack_entry.hp, atk: result.backpack_entry.atk, def: result.backpack_entry.def,
          spd: result.backpack_entry.spd, crit: result.backpack_entry.crit,
          exceptional: result.backpack_entry.exceptional, nickname: null, caught_at: new Date().toISOString(),
        });
        wpBackpackLoaded = true;
      }
      if (typeof result.backpack_cap === 'number') wpBackpackCap = result.backpack_cap;
      wpUpdateBadge();

      el.classList.add('wp-caught');
      setTimeout(() => el.remove(), 500);
      wpSoundCatch();
      if (result.backpack_entry && result.backpack_entry.exceptional) {
        wpToastRaw('💠', `Espécime PERFEITO! ${mon.n} rolou os 5 stats altos — abra a mochila pra ver.`, true);
      } else {
        wpToastCatch(mon, true, null, result.backpack_entry);
      }
      if (result.backpack_full) {
        setTimeout(() => wpToastRaw('🎒', `Mochila cheia (${result.backpack_count}/${result.backpack_cap}) — abra e libere algum Pokémon quando quiser.`, false), 1600);
      }

      // Reflete XP/nível/conquistas novas no painel do Dashboard e no
      // badge do header, do mesmo jeito que toggleSlot() já faz hoje
      // pro Fichário — xp_system.js carrega antes deste arquivo
      // (ver index.html), então essas funções já existem em window.
      if (typeof xpFetchAll === 'function') {
        xpFetchAll().then(() => {
          if (typeof xpRenderBadge === 'function' && typeof currentUser !== 'undefined') xpRenderBadge(currentUser);
          if (document.getElementById('dash')?.classList.contains('active') && typeof xpRenderDashPanel === 'function') xpRenderDashPanel();
        });
      }
    } else {
      el.classList.add('wp-fled');
      setTimeout(() => el.remove(), 550);
      wpSoundFlee();
      wpToastCatch(mon, false, tier);
    }
    wpActiveMon = null;
  }

  // ── Toasts ───────────────────────────────────────────────────
  function wpToastRaw(emoji, text, success) {
    const el = document.createElement('div');
    el.className = `wp-toast ${success === false ? 'wp-fail' : ''}`;
    el.innerHTML = `<span style="font-size:22px">${emoji}</span><span>${text}</span>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('wp-show'));
    setTimeout(() => { el.classList.remove('wp-show'); setTimeout(() => el.remove(), 350); }, 3400);
  }

  function wpToastCatch(mon, success, tier, entry) {
    const meta = WP_RARITY_META[mon.r];
    const el = document.createElement('div');
    el.className = `wp-toast ${success ? '' : 'wp-fail'}`;
    if (success) {
      const isNew = wpCatches[mon.s].count === 1;
      // Média dos 5 stats no próprio toast (04/09/2026, pedido do Eduardo) —
      // só aparece quando o backpack_entry veio junto (sempre vem numa
      // captura normal; guard aqui é só defensivo).
      const avgHtml = entry ? ` <span class="wp-toast-avg">Média ${wpStatAvg(entry)}</span>` : '';
      el.innerHTML = `<img src="${wpSpriteUrl(mon.d)}" alt=""><span>${isNew ? 'Você pegou!!!' : 'De novo!'} <b style="color:${meta.color}">${mon.n}</b> · ${meta.label}${avgHtml}</span>`;
    } else {
      el.innerHTML = `<img src="${wpSpriteUrl(mon.d)}" alt=""><span><b>${mon.n}</b> fugiu com a ${WP_BALL_META[tier].label}! Foi por pouco.</span>`;
    }
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('wp-show'));
    setTimeout(() => { el.classList.remove('wp-show'); setTimeout(() => el.remove(), 350); }, 3600);
  }

  // ── Ganho de pokébolas (uso do site) ────────────────────────
  window.wpGrantBall = function (tier, qty, reason) {
    qty = qty || 1;
    if (!WP_BALL_META[tier]) { console.warn('[wp] tier inválido:', tier); return; }
    wpBalls[tier] = (wpBalls[tier] || 0) + qty;
    wpSaveBalls();
    wpDbSaveBalls();
    wpUpdateBadge();
    wpToastRaw(wpBallIconHtml(tier, 22), `+${qty} ${WP_BALL_META[tier].label}${reason ? ' — ' + reason : ''}`, true);
  };

  function wpMaybeGrantBallFromUsage(baseChance) {
    if (!wpEnabled) return; // minigame desligado — não ganha bola nem spawna
    if (wpDailyBallsCount() >= WP_DAILY_BALL_CAP) return; // teto diário de bola por uso passivo já batido
    if (Math.random() < baseChance) {
      window.wpGrantBall('pokeball', 1, 'por usar o site');
      wpDailyBallsIncrement();
    }
  }

  // ── Liga/desliga o minigame inteiro ─────────────────────────
  function wpSetEnabled(on) {
    wpEnabled = on;
    wpSaveJSON(WP_STORAGE_ENABLED, wpEnabled);
    if (!wpEnabled && wpActiveEl) {
      document.querySelectorAll('.wp-ballpicker').forEach(n => n.remove());
      wpActiveEl.remove();
      wpActiveEl = null;
      wpActiveMon = null;
    }
    wpUpdateBadge();
  }
  window.wpToggle = () => { wpSetEnabled(!wpEnabled); return wpEnabled ? 'minigame ligado' : 'minigame desligado'; };

  // ── Badge + modal (inventário + pokédex) ────────────────────
  let wpBadgeEl = null;

  function wpUpdateBadge() {
    if (!wpBadgeEl) return;
    const totalCaught = Object.keys(wpCatches).length;
    const totalBalls = WP_BALL_ORDER.reduce((s, t) => s + (wpBalls[t] || 0), 0);
    wpBadgeEl.classList.toggle('wp-badge-off', !wpEnabled);
    const bagPart = wpBackpackLoaded ? ` · 🎒 ${wpBackpack.length}/${wpBackpackCap}` : '';
    // Não existe emoji de pokébola de verdade no Unicode — reaproveita o
    // mesmo ícone (imagem) já usado no seletor de bola/inventário, só que
    // pequeno, em vez de usar um emoji genérico (bola de basebol) no lugar.
    wpBadgeEl.querySelector('.wp-badge-text').innerHTML = wpEnabled
      ? `${wpBallIconHtml('pokeball', 13)} ${totalBalls} · 🐾 ${totalCaught}/${WP_KANTO151.length}${bagPart}`
      : `Minigame desligado`;
    const powerBtn = wpBadgeEl.querySelector('.wp-power-btn');
    if (powerBtn) { powerBtn.textContent = wpEnabled ? '🎮' : '🚫'; powerBtn.title = wpEnabled ? 'Desligar minigame' : 'Ligar minigame'; }
  }

  function wpBuildBadge() {
    if (wpBadgeEl) return;
    wpBadgeEl = document.createElement('div');
    wpBadgeEl.className = 'wp-badge';
    wpBadgeEl.innerHTML = `<span class="wp-badge-text"></span><span class="wp-sound-btn" title="Som">${wpSoundOn ? '🔊' : '🔇'}</span><span class="wp-power-btn" title="Desligar minigame">${wpEnabled ? '🎮' : '🚫'}</span>`;
    wpBadgeEl.querySelector('.wp-badge-text').addEventListener('click', wpOpenDex);
    wpBadgeEl.querySelector('.wp-sound-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      wpSoundOn = !wpSoundOn;
      wpSaveJSON(WP_STORAGE_SOUND, wpSoundOn);
      e.target.textContent = wpSoundOn ? '🔊' : '🔇';
      if (wpSoundOn) wpSoundCatch();
    });
    wpBadgeEl.querySelector('.wp-power-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      wpSetEnabled(!wpEnabled);
    });
    document.body.appendChild(wpBadgeEl);
    wpUpdateBadge();
  }

  function wpOpenDex(tab) {
    tab = tab || 'dex';
    const backdrop = document.createElement('div');
    backdrop.className = 'wp-modal-backdrop';
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

    const totalCaught = Object.keys(wpCatches).length;

    const invHtml = WP_BALL_ORDER.map(tier => {
      const meta = WP_BALL_META[tier];
      return `<div class="wp-inv-row">
        ${wpBallIconHtml(tier, 28)}
        <span class="wp-inv-label">${meta.label}</span>
        <span class="wp-inv-qty">${wpBalls[tier] || 0}</span>
      </div>`;
    }).join('');

    const dexHtml = WP_KANTO151.map(mon => {
      const got = !!wpCatches[mon.s];
      const meta = WP_RARITY_META[mon.r];
      return `<div class="wp-cell ${got ? 'wp-got' : ''}">
        <img src="${wpSpriteUrl(mon.d)}" alt="">
        <div class="wp-n">${got ? mon.n : '???'}</div>
        <div class="wp-r" style="color:${got ? meta.color : '#52597a'}">${got ? meta.label : ''}</div>
      </div>`;
    }).join('');

    backdrop.innerHTML = `<div class="wp-modal">
      <button class="wp-close" aria-label="Fechar">×</button>
      <h3>🐾 Pokémon Escondidos</h3>
      <div class="wp-sub">${totalCaught}/${WP_KANTO151.length} capturados — flagre os Pokémon que aparecem espiando pelo site</div>
      <div class="wp-tabs">
        <div class="wp-tab" data-tab="dex">Pokédex</div>
        <div class="wp-tab" data-tab="mochila">Mochila</div>
        <div class="wp-tab" data-tab="inv">Inventário</div>
      </div>
      <div class="wp-panel-dex wp-grid" style="display:${tab === 'dex' ? 'grid' : 'none'}">${dexHtml}</div>
      <div class="wp-panel-mochila" style="display:${tab === 'mochila' ? 'block' : 'none'}"></div>
      <div class="wp-panel-inv" style="display:${tab === 'inv' ? 'block' : 'none'}">${invHtml}</div>
    </div>`;

    document.body.appendChild(backdrop);
    const mochilaPanel = backdrop.querySelector('.wp-panel-mochila');

    backdrop.querySelector('.wp-close').addEventListener('click', () => backdrop.remove());
    backdrop.querySelectorAll('.wp-tab').forEach(t => {
      t.classList.toggle('wp-tab-active', t.dataset.tab === tab);
      t.addEventListener('click', () => {
        backdrop.querySelectorAll('.wp-tab').forEach(x => x.classList.remove('wp-tab-active'));
        t.classList.add('wp-tab-active');
        backdrop.querySelector('.wp-panel-dex').style.display = t.dataset.tab === 'dex' ? 'grid' : 'none';
        backdrop.querySelector('.wp-panel-mochila').style.display = t.dataset.tab === 'mochila' ? 'block' : 'none';
        backdrop.querySelector('.wp-panel-inv').style.display = t.dataset.tab === 'inv' ? 'block' : 'none';
        if (t.dataset.tab === 'mochila') wpRenderMochilaGrid(mochilaPanel);
      });
    });

    if (tab === 'mochila') wpRenderMochilaGrid(mochilaPanel);
  }

  // ── Mochila: grid de indivíduos + detalhe de stats ──────────────
  async function wpRenderMochilaGrid(container) {
    if (!wpHasClient() || !wpUid()) {
      container.innerHTML = `<div class="wp-bp-empty">Faça login pra ter uma mochila — ela vive na sua conta, não no aparelho.</div>`;
      return;
    }
    container.innerHTML = `<div class="wp-bp-empty">Carregando…</div>`;
    if (!wpBackpackLoaded) await wpFetchBackpack();

    if (wpBackpack.length === 0) {
      container.innerHTML = `<div class="wp-bp-empty">Sua mochila está vazia — capture algum Pokémon pra guardar o primeiro aqui.</div>`;
      return;
    }

    const fullBanner = wpBackpack.length > wpBackpackCap
      ? `<div class="wp-bp-full-banner">🎒 Mochila cheia (${wpBackpack.length}/${wpBackpackCap}) — clique em algum pra liberar espaço.</div>`
      : '';

    if (!wpLoadoutLoaded) await wpFetchLoadout();

    container.innerHTML = fullBanner + `<div class="wp-grid">${wpBackpack.map(entry => {
      const meta = WP_RARITY_META[entry.rarity];
      const isPrincipal = wpLoadout.principal_id === entry.id;
      const isTeam = (wpLoadout.team_ids || []).includes(entry.id);
      const tags = (isPrincipal ? '⭐' : '') + (isTeam ? '🛡️' : '');
      return `<div class="wp-cell wp-bp-cell ${entry.exceptional ? 'wp-bp-exceptional' : ''}" data-id="${entry.id}">
        ${entry.exceptional ? '<span class="wp-bp-exceptional-tag">💠</span>' : ''}
        ${tags ? `<span class="wp-bp-cell-tags">${tags}</span>` : ''}
        <img src="${wpSpriteUrl(entry.dex)}" alt="">
        <div class="wp-bp-nick">${wpBackpackDisplayName(entry)}</div>
        <div class="wp-r" style="color:${meta.color}">${meta.label}</div>
      </div>`;
    }).join('')}</div>`;

    container.querySelectorAll('.wp-bp-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const entry = wpBackpack.find(b => b.id === cell.dataset.id);
        if (entry) wpRenderBackpackDetail(container, entry);
      });
    });
  }

  function wpRenderBackpackDetail(container, entry) {
    const meta = WP_RARITY_META[entry.rarity];
    const statsHtml = WP_STAT_ORDER.map(k => `<div class="wp-statbar-row">
      <span class="wp-statbar-label">${WP_STAT_LABELS[k]}</span>
      <span class="wp-statbar-track"><span class="wp-statbar-fill" style="width:${entry[k]}%"></span></span>
      <span class="wp-statbar-val">${entry[k]}</span>
    </div>`).join('');
    const caughtDate = new Date(entry.caught_at).toLocaleDateString('pt-BR');
    // Média geral (04/09/2026, pedido do Eduardo) — mesmo número do toast
    // de captura, mas maior/destacado aqui: um card próprio acima das 5
    // barras, não só mais uma linha igual às outras.
    const avg = wpStatAvg(entry);

    container.innerHTML = `
      <div class="wp-bp-detail-head">
        <img src="${wpSpriteUrl(entry.dex)}" alt="">
        <div style="flex:1">
          <input class="wp-bp-nick-input" maxlength="24" value="${wpBackpackDisplayName(entry)}" placeholder="Apelido">
          <div class="wp-sub" style="margin:4px 0 0"><span style="color:${meta.color}">${meta.label}</span> · capturado em ${caughtDate}</div>
        </div>
      </div>
      ${entry.exceptional ? `<div class="wp-bp-full-banner">💠 Espécime Excepcional — os 5 stats vieram altos. Raríssimo!</div>` : ''}
      <div class="wp-bp-avg-card">
        <span class="wp-bp-avg-label">Média Geral</span>
        <span class="wp-bp-avg-val">${avg}</span>
      </div>
      ${statsHtml}
      <div class="wp-bp-tag-row">
        <div class="wp-bp-tag-btn ${wpLoadout.principal_id === entry.id ? 'wp-bp-tag-active' : ''}" data-act="principal">⭐ Principal (1x1)</div>
        <div class="wp-bp-tag-btn ${(wpLoadout.team_ids || []).includes(entry.id) ? 'wp-bp-tag-active' : ''}" data-act="team">🛡️ Equipe (3x3)</div>
      </div>
      <div class="wp-bp-actions">
        <div class="wp-bp-btn wp-bp-btn-back" data-act="back">← Voltar</div>
        <div class="wp-bp-btn wp-bp-btn-danger" data-act="release">Liberar</div>
      </div>
    `;

    container.querySelector('[data-act="principal"]').addEventListener('click', async () => {
      await wpTogglePrincipal(entry.id);
      wpRenderBackpackDetail(container, entry);
    });
    container.querySelector('[data-act="team"]').addEventListener('click', async () => {
      await wpToggleTeamMember(entry.id);
      wpRenderBackpackDetail(container, entry);
    });

    const nickInput = container.querySelector('.wp-bp-nick-input');
    nickInput.addEventListener('blur', async () => {
      const val = nickInput.value.trim();
      if (val === wpBackpackDisplayName(entry)) return;
      await wpRenameBackpack(entry.id, val);
    });
    nickInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nickInput.blur(); });

    container.querySelector('[data-act="back"]').addEventListener('click', () => wpRenderMochilaGrid(container));

    const releaseBtn = container.querySelector('[data-act="release"]');
    releaseBtn.addEventListener('click', () => {
      if (!releaseBtn.classList.contains('wp-bp-confirm')) {
        releaseBtn.classList.add('wp-bp-confirm');
        releaseBtn.textContent = 'Confirmar? Não dá pra desfazer';
        return;
      }
      releaseBtn.textContent = 'Liberando…';
      wpReleaseBackpack(entry.id).then((ok) => {
        if (ok) {
          wpToastRaw('🎒', `${wpBackpackDisplayName(entry)} voltou pra natureza.`, true);
          wpRenderMochilaGrid(container);
        } else {
          wpToastRaw('⚠️', 'Não deu pra liberar agora, tenta de novo.', false);
        }
      });
    });
  }

  // ── Arena: botão + batalha ──────────────────────────────────────
  let wpArenaEl = null;

  function wpBuildArenaButton() {
    if (wpArenaEl) return;
    wpArenaEl = document.createElement('div');
    wpArenaEl.className = 'wp-arena-btn';
    wpArenaEl.textContent = '⚔️ Batalhar';
    wpArenaEl.addEventListener('click', wpStartBattle);
    document.body.appendChild(wpArenaEl);
    wpUpdateArenaButton();
  }

  function wpUpdateArenaButton() {
    if (!wpArenaEl) return;
    if (!wpHasClient() || !wpUid()) {
      wpArenaEl.textContent = '⚔️ Faça login pra batalhar';
      wpArenaEl.classList.add('wp-arena-disabled');
      return;
    }
    if (!wpLoadoutLoaded) {
      wpArenaEl.textContent = '⚔️ Batalhar';
      wpArenaEl.classList.remove('wp-arena-disabled');
      return;
    }
    if (!wpLoadoutReady()) {
      wpArenaEl.textContent = '⚔️ Defina sua Equipe';
      wpArenaEl.classList.add('wp-arena-disabled');
    } else {
      const record = (wpLoadout.wins != null) ? ` (${wpLoadout.wins}V-${wpLoadout.losses}D)` : '';
      wpArenaEl.textContent = `⚔️ Batalhar${record}`;
      wpArenaEl.classList.remove('wp-arena-disabled');
    }
  }

  async function wpStartBattle() {
    if (wpBattleBusy) return;
    if (!wpHasClient() || !wpUid()) { wpToastRaw('⚔️', 'Faça login pra batalhar.', false); return; }
    if (!wpLoadoutLoaded) await wpFetchLoadout();
    if (!wpLoadoutReady()) {
      wpToastRaw('🛡️', 'Defina seu Pokémon Principal e sua Equipe de 3 na mochila primeiro.', false);
      wpOpenDex('mochila');
      return;
    }

    wpBattleBusy = true;
    const original = wpArenaEl.textContent;
    wpArenaEl.textContent = '⚔️ Buscando rival…';
    wpArenaEl.classList.add('wp-arena-disabled');

    const { data, error } = await sbClient.rpc('battle_random_opponent');

    wpBattleBusy = false;
    if (error) {
      wpToastRaw('⚠️', error.message, false);
      wpUpdateArenaButton();
      return;
    }
    wpLoadout.wins = data.my_record.wins;
    wpLoadout.losses = data.my_record.losses;
    wpUpdateArenaButton();
    wpOpenBattleModal(data);
  }

  // ── Modal de batalha: anima cada duelo rodada a rodada ──────────
  function wpOpenBattleModal(result) {
    const backdrop = document.createElement('div');
    backdrop.className = 'wp-modal-backdrop';

    backdrop.innerHTML = `<div class="wp-modal wp-battle-modal">
      <button class="wp-close" aria-label="Fechar">×</button>
      <h3>⚔️ Arena</h3>
      <div class="wp-battle-format">${result.format === '1x1' ? 'Duelo 1x1' : 'Batalha em Equipe 3x3'}</div>
      <div class="wp-battle-list"></div>
      <div class="wp-battle-final" style="display:none"></div>
    </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.wp-close').addEventListener('click', () => backdrop.remove());

    const list = backdrop.querySelector('.wp-battle-list');
    result.duels.forEach((_, i) => {
      const d = document.createElement('div');
      d.className = 'wp-battle-duel';
      d.dataset.idx = i;
      list.appendChild(d);
    });

    wpPlayDuelsSequentially(backdrop, result, 0);
  }

  function wpPlayDuelsSequentially(backdrop, result, idx) {
    if (idx >= result.duels.length) {
      wpShowBattleFinal(backdrop, result);
      return;
    }
    const duel = result.duels[idx];
    const el = backdrop.querySelector(`.wp-battle-duel[data-idx="${idx}"]`);
    const aName = duel.a.slug, bName = duel.b.slug;
    const aMonName = (WP_KANTO151.find(m => m.s === aName) || {}).n || aName;
    const bMonName = (WP_KANTO151.find(m => m.s === bName) || {}).n || bName;
    const aHpMax = duel.a.hp * 3, bHpMax = duel.b.hp * 3;

    el.innerHTML = `
      <div class="wp-battle-vs">
        <div class="wp-battle-side" data-side="a">
          <img src="${wpSpriteUrl(duel.a.dex)}" alt="">
          <div class="wp-n">Você — ${aMonName}</div>
          <div class="wp-battle-hpbar-track"><div class="wp-battle-hpbar-fill" style="width:100%"></div></div>
        </div>
        <div class="wp-battle-vs-label">VS</div>
        <div class="wp-battle-side" data-side="b">
          <img src="${wpSpriteUrl(duel.b.dex)}" alt="">
          <div class="wp-n">Rival — ${bMonName}</div>
          <div class="wp-battle-hpbar-track"><div class="wp-battle-hpbar-fill" style="width:100%"></div></div>
        </div>
      </div>
      <div class="wp-battle-dmg">&nbsp;</div>
      <div class="wp-battle-duel-result"></div>
    `;

    const barA = el.querySelector('[data-side="a"] .wp-battle-hpbar-fill');
    const barB = el.querySelector('[data-side="b"] .wp-battle-hpbar-fill');
    const dmgEl = el.querySelector('.wp-battle-dmg');
    const log = duel.result.log;
    let step = 0;

    function playStep() {
      if (step >= log.length) {
        const resEl = el.querySelector('.wp-battle-duel-result');
        resEl.textContent = duel.result.winner === 'a' ? 'Você venceu este duelo!' : 'O rival venceu este duelo.';
        setTimeout(() => wpPlayDuelsSequentially(backdrop, result, idx + 1), 900);
        return;
      }
      const hit = log[step];
      const sideEl = el.querySelector(`[data-side="${hit.side}"]`);
      sideEl.classList.add('wp-battle-hit');
      wpSoundHit(hit.crit);
      dmgEl.textContent = `${hit.crit ? 'CRÍTICO! ' : ''}-${hit.dmg}`;
      dmgEl.classList.toggle('wp-battle-crit', !!hit.crit);

      if (hit.side === 'a') {
        const pct = Math.max(0, Math.min(100, (hit.hp_b / bHpMax) * 100));
        barB.style.width = pct + '%';
        barB.classList.toggle('wp-battle-low', pct < 30);
      } else {
        const pct = Math.max(0, Math.min(100, (hit.hp_a / aHpMax) * 100));
        barA.style.width = pct + '%';
        barA.classList.toggle('wp-battle-low', pct < 30);
      }
      setTimeout(() => sideEl.classList.remove('wp-battle-hit'), 200);
      step++;
      setTimeout(playStep, 550);
    }
    playStep();
  }

  function wpShowBattleFinal(backdrop, result) {
    const won = result.overall === 'a';
    const finalEl = backdrop.querySelector('.wp-battle-final');
    finalEl.style.display = 'block';
    finalEl.innerHTML = `
      <div class="wp-battle-banner ${won ? 'wp-win' : 'wp-lose'}">${won ? 'VITÓRIA!' : 'DERROTA'}</div>
      <div class="wp-battle-record">Seu retrospecto: ${result.my_record.wins}V - ${result.my_record.losses}D</div>
    `;
    if (won) wpSoundVictory(); else wpSoundDefeat();
    if (typeof xpFetchAll === 'function') {
      xpFetchAll().then(() => {
        if (typeof xpRenderBadge === 'function' && typeof currentUser !== 'undefined') xpRenderBadge(currentUser);
      });
    }
  }

  // ── Timer base ───────────────────────────────────────────────
  // Intervalo médio derivado direto da cadência diária (384 aparições/dia
  // no total, distribuídas por raridade em wpPickMon). No modo teste, o
  // "dia" é comprimido pra 20min só pra dar pra validar rápido — a
  // PROPORÇÃO entre raridades é a mesma dos dois modos, só a velocidade
  // muda. chance=1 porque a raridade sorteada já embute a probabilidade;
  // o intervalo entre tentativas é que faz a cadência de verdade.
  const WP_AVG_INTERVAL_MS = (WP_TEST_MODE ? WP_TEST_DAY_COMPRESS_MS : WP_DAY_MS) / WP_DAILY_TOTAL;

  function wpScheduleBase() {
    const jitter = 0.5 + Math.random(); // 0.5x–1.5x pra não ficar num ritmo mecânico
    const intervalMs = WP_AVG_INTERVAL_MS * jitter;
    setTimeout(() => {
      wpSpawn(1);
      wpMaybeGrantBallFromUsage(WP_TEST_MODE ? 0.03 : 0.06);
      wpScheduleBase();
    }, intervalMs);
  }

  // ── Hook em window.go (troca de aba) — mesmo padrão de xp_system.js ──
  // Chance extra (bônus por interação), independente da cadência base acima.
  (function hookWildPokemon() {
    function tryHook() {
      if (typeof window.go !== 'function') {
        setTimeout(tryHook, 50);
        return;
      }
      const originalGo = window.go;
      window.go = function (id, el) {
        originalGo(id, el);
        wpSpawn(WP_TEST_MODE ? 0.5 : 0.15);
        wpMaybeGrantBallFromUsage(WP_TEST_MODE ? 0.15 : 0.05);
      };
    }
    tryHook();
  })();

  // ── Boot ─────────────────────────────────────────────────────
  function wpInit() {
    wpBuildBadge();
    wpBuildArenaButton();
    wpScheduleBase();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wpInit);
  } else {
    wpInit();
  }

  // Cobre o caso do evento de auth já ter disparado antes deste script
  // terminar de instalar os hooks (mesma janela de segurança do xp_system.js).
  // Importante: espera o wpSyncFromCloud() TERMINAR antes de checar o
  // bônus de login — senão, em usuário logado em dois aparelhos, o
  // segundo aparelho poderia rodar wpCheckDailyLoginBonus() antes de
  // saber que o outro já reclamou hoje e dar a Great Ball em dobro.
  async function wpDailyBootSequence() {
    await wpSyncFromCloud();
    wpCheckDailyLoginBonus();
    wpFetchBackpack(); // não bloqueia o boot — só pra badge/mochila já vir preenchida
    wpFetchLoadout();  // idem, pro botão de Batalhar já vir com o rótulo certo
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(wpDailyBootSequence, 900);
    });
  } else {
    setTimeout(wpDailyBootSequence, 900);
  }

  // ── Debug (console) ─────────────────────────────────────────
  window.wpForceSpawn = () => wpSpawn(1);
  window.wpReset = () => {
    wpCatches = {};
    wpBalls = { pokeball: 5, greatball: 2, ultraball: 1, masterball: 0 };
    wpSaveCatches();
    wpSaveBalls();
    localStorage.removeItem(WP_STORAGE_DAILY_BALLS);
    localStorage.removeItem(WP_STORAGE_DAILY_BONUS);
    if (wpHasClient() && wpUid()) wpDbSaveDaily(); // zera também na conta (dia "hoje" com contadores em 0/false)
    wpUpdateBadge();
  };
  window.wpStatus = () => {
    const balls = WP_BALL_ORDER.map(t => `${WP_BALL_META[t].emoji}${wpBalls[t] || 0}`).join(' ');
    return `${Object.keys(wpCatches).length}/${WP_KANTO151.length} capturados · bolas: ${balls} · Poké Ball hoje: ${wpDailyBallsCount()}/${WP_DAILY_BALL_CAP}`;
  };
})();
