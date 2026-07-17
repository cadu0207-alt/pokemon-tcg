#!/usr/bin/env node
/**
 * snapshot_value.js — Registra um snapshot diário do valor total da coleção
 * de cada usuário (soma dos preços de todos os slots coletados no fichário,
 * a mesma conta de calcCollectedValue() em app.js) na tabela `value_history`.
 *
 * Roda via GitHub Actions todo dia (ver .github/workflows/snapshot_value.yml),
 * ou manualmente:
 *     SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/snapshot_value.js
 *     SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/snapshot_value.js --dry-run
 *
 * Diferente de update_prices.py, este script só fala com o Supabase (não
 * faz scraping de site nenhum) — não deve esbarrar no bloqueio de IP de
 * datacenter que forçou o update_prices a rodar localmente.
 *
 * Como funciona:
 *   1. Carrega os arquivos cards_*.js / legacy_*.js num sandbox de VM (são
 *      JS de verdade, não regex) pra montar {setId: {numeroCarta: {versao: preco}}} —
 *      espelha SET_CARDS_MAP + getSlots() de app.js. Se um set novo for
 *      adicionado lá, adicionar aqui também (ver SET_CARDS_MAP abaixo).
 *   2. Busca slot_key + quantity da tabela `collection` via REST do Supabase
 *      (service role key — só ela consegue ler entre usuários, RLS bloqueia
 *      o resto).
 *   3. Agrupa por user_id, soma preço-por-versão × quantity de cada slot.
 *   4. Upsert em `value_history` (user_id, date, total_value) com a data de
 *      hoje no horário de Brasília (UTC-3 fixo, sem horário de verão).
 *
 * CORRIGIDO 17/07/2026: este script divergia do "Valor Fichário" do
 * dashboard (calcCollectedValue()) por dois motivos — (a) não buscava
 * `quantity`, então cartas com múltiplas cópias eram contadas como 1x; e
 * (b) usava c.price para qualquer versão do slot, ignorando o prêmio de
 * Reverse Holo (+20% / priceRH) e o priceF de cartas "Rara". Isso fazia a
 * "Evolução do Patrimônio" subvalorizar a coleção em relação ao KPI do
 * dashboard. Ver [[feedback_coding]].
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.dirname(__dirname);
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SERVICE_KEY) {
  console.error('Faltou a env SUPABASE_SERVICE_ROLE_KEY (Settings -> API -> service_role no painel do Supabase).');
  process.exit(1);
}

// ---- 1. Carrega os arquivos de cartas num sandbox de VM --------------------

const CARD_FILES = [
  'cards_me04.js', 'cards_me03.js', 'cards_me02.js', 'cards_meg.js',
  'cards_me05.js', 'cards_me06.js', 'cards_mep.js',
  'cards_sv1.js', 'cards_sv2.js', 'cards_sv3.js', 'cards_sv3pt5.js',
  'cards_sv4.js', 'cards_sv4pt5.js', 'cards_sv5.js', 'cards_sv6.js',
  'cards_sv6pt5.js', 'cards_sv7.js', 'cards_sv8.js', 'cards_sv8pt5.js',
  'cards_sv9.js', 'cards_sv10.js',
  'legacy_swsh.js', 'legacy_sm.js', 'legacy_xy.js', 'legacy_bw.js',
  'legacy_hgss.js', 'legacy_dp.js', 'legacy_ex.js', 'legacy_classic.js',
];

const sandbox = {};
sandbox.window = sandbox; // legacy_*.js escreve em window.LEGACY_SETS
vm.createContext(sandbox);

for (const file of CARD_FILES) {
  const filepath = path.join(REPO_ROOT, file);
  if (!fs.existsSync(filepath)) continue; // sets futuros ainda sem arquivo
  const src = fs.readFileSync(filepath, 'utf8').replace(/\x00/g, ''); // limpa artefato de bytes nulos conhecido
  vm.runInContext(src, sandbox, { filename: file });
}

// IMPORTANTE: `const`/`let` no topo de um script rodado via vm.runInContext
// NAO viram propriedades do objeto global do sandbox (diferente de `var` ou
// de `window.X = ...`) -- por isso nao da pra ler sandbox.CARDS diretamente.
// Precisamos avaliar uma expressao no mesmo contexto pra capturar os valores.
const CONST_NAMES = [
  'CARDS', 'CARDS_ME03', 'CARDS_ME02', 'CARDS_MEG', 'CARDS_ME05', 'CARDS_ME06', 'CARDS_MEP',
  'CARDS_SV1', 'CARDS_SV2', 'CARDS_SV3', 'CARDS_SV3PT5', 'CARDS_SV4', 'CARDS_SV4PT5',
  'CARDS_SV5', 'CARDS_SV6', 'CARDS_SV6PT5', 'CARDS_SV7', 'CARDS_SV8', 'CARDS_SV8PT5',
  'CARDS_SV9', 'CARDS_SV10',
];
const captureExpr = '({' + CONST_NAMES.map(function (n) {
  return n + ": typeof " + n + "!=='undefined'?" + n + ':[]';
}).join(',') + '})';
const consts = vm.runInContext(captureExpr, sandbox);

// Espelha SET_CARDS_MAP de app.js -- manter em sincronia se um set novo entrar la.
const SET_CARDS_MAP = {
  me06: consts.CARDS_ME06,
  me05: consts.CARDS_ME05,
  me04: consts.CARDS,
  me03: consts.CARDS_ME03,
  me02: consts.CARDS_ME02,
  meg: consts.CARDS_MEG,
  mep: consts.CARDS_MEP,
  sv1: consts.CARDS_SV1,
  sv2: consts.CARDS_SV2,
  sv3: consts.CARDS_SV3,
  sv3pt5: consts.CARDS_SV3PT5,
  sv4: consts.CARDS_SV4,
  sv4pt5: consts.CARDS_SV4PT5,
  sv5: consts.CARDS_SV5,
  sv6: consts.CARDS_SV6,
  sv6pt5: consts.CARDS_SV6PT5,
  sv7: consts.CARDS_SV7,
  sv8: consts.CARDS_SV8,
  sv8pt5: consts.CARDS_SV8PT5,
  sv9: consts.CARDS_SV9,
  sv10: consts.CARDS_SV10,
};
// window === sandbox aqui, entao window.LEGACY_SETS realmente vira sandbox.LEGACY_SETS
// (atribuicao via propriedade, nao `const`, entao esse acesso direto funciona).
(sandbox.LEGACY_SETS || []).forEach(function (ls) {
  if (ls && ls.id && !SET_CARDS_MAP[ls.id]) SET_CARDS_MAP[ls.id] = ls.data || [];
});

// Espelho de getSlots() em app.js -- o preco de um slot depende da versao
// (N/F/RH/SP), NAO e sempre igual a c.price. Manter em sincronia se
// getSlots() mudar no app.js.
function getSlotsForSnapshot(c, setId) {
  const r = c.rare || '';
  if (!c.base) return [{ ver: 'SP', price: c.price }];
  if (r.includes('Dupla') || r.includes('RR')) return [{ ver: 'F', price: c.price }];
  if (r === 'Rara' || (r.startsWith('Rara ') && !r.includes('Ultra'))) {
    return [
      { ver: 'F', price: c.priceF || c.price },
      { ver: 'RH', price: c.priceRH || (c.price ? +(c.price * 1.2).toFixed(2) : null) },
    ];
  }
  if (setId === 'mep') return [{ ver: 'SP', price: c.price }];
  return [
    { ver: 'N', price: c.price },
    { ver: 'RH', price: c.priceRH || (c.price ? +(c.price * 1.2).toFixed(2) : null) },
  ];
}

// {setId: {numeroCarta: {versao: preco}}}
const priceMap = {};
let totalCardsLoaded = 0;
for (const setId of Object.keys(SET_CARDS_MAP)) {
  const cards = SET_CARDS_MAP[setId] || [];
  priceMap[setId] = {};
  cards.forEach(function (c) {
    if (!c || !c.n) return;
    const slots = getSlotsForSnapshot(c, setId);
    priceMap[setId][c.n] = {};
    slots.forEach(function (s) {
      priceMap[setId][c.n][s.ver] = Number(s.price) || 0;
    });
    // fallback pra versoes fora do esperado (nao deveria acontecer, mas
    // evita perder valor silenciosamente se getSlots() ganhar uma versao nova)
    priceMap[setId][c.n]._fallback = Number(c.price) || 0;
    totalCardsLoaded++;
  });
}
console.log(totalCardsLoaded + ' cartas carregadas em ' + Object.keys(priceMap).length + ' colecoes.');

// ---- 2. Busca todos os slots coletados (todos os usuarios) ----------------

async function sbFetch(pathAndQuery, opts) {
  opts = opts || {};
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + pathAndQuery, Object.assign({}, opts, {
    headers: Object.assign({
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
    }, opts.headers || {}),
  }));
  if (!r.ok) {
    const body = await r.text().catch(function () { return ''; });
    throw new Error('Supabase REST ' + r.status + ': ' + body.slice(0, 300));
  }
  return r;
}

async function fetchAllCollectionRows() {
  const PAGE = 1000;
  let offset = 0;
  const rows = [];
  for (;;) {
    const r = await sbFetch('collection?select=user_id,slot_key,quantity&order=user_id.asc', {
      headers: { Range: offset + '-' + (offset + PAGE - 1) },
    });
    const page = await r.json();
    rows.push.apply(rows, page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

// rows: [{slot_key, quantity}] -- mesma logica de calcCollectedValue() em
// app.js: preco por versao do slot × quantity (default 1 se null/undefined).
function valueForSlots(rows) {
  let total = 0;
  for (const row of rows) {
    const sk = row.slot_key != null ? row.slot_key : row; // aceita string solta tb
    const qty = Number(row.quantity) || 1;
    const parts = String(sk).split(':'); // "setId:numero:versao"
    if (parts.length < 3) continue;
    const setId = parts[0];
    const n = parts[1];
    const ver = parts[2];
    const entry = priceMap[setId] ? priceMap[setId][n] : undefined;
    if (!entry) continue;
    const price = entry[ver] != null ? entry[ver] : entry._fallback;
    if (price) total += price * qty;
  }
  return Math.round(total * 100) / 100;
}

// Data de "hoje" no horario de Brasilia (UTC-3 fixo -- Brasil nao usa mais horario de verao).
function todayBRT() {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  return brt.toISOString().slice(0, 10);
}

// ---- 3. Main ----------------------------------------------------------

async function main() {
  const date = todayBRT();
  console.log('[' + new Date().toISOString() + '] Calculando snapshot de valor -- data BRT: ' + date + (DRY_RUN ? ' (DRY-RUN)' : ''));

  const rows = await fetchAllCollectionRows();
  console.log(rows.length + ' slots coletados encontrados no total.');

  const byUser = {};
  for (const r of rows) {
    if (!byUser[r.user_id]) byUser[r.user_id] = [];
    byUser[r.user_id].push({ slot_key: r.slot_key, quantity: r.quantity });
  }

  const userIds = Object.keys(byUser);
  const snapshots = userIds.map(function (user_id) {
    return { user_id: user_id, date: date, total_value: valueForSlots(byUser[user_id]) };
  });

  console.log(snapshots.length + ' usuarios com colecao.');
  snapshots.forEach(function (s) {
    console.log('   ' + s.user_id.slice(0, 8) + '... -> R$' + s.total_value.toFixed(2));
  });

  if (DRY_RUN) {
    console.log('DRY-RUN -- nada foi gravado.');
    return;
  }

  if (snapshots.length === 0) {
    console.log('Nenhum usuario com colecao -- nada a gravar.');
    return;
  }

  await sbFetch('value_history', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(snapshots),
  });

  console.log(snapshots.length + ' snapshots gravados em value_history para ' + date + '.');
}

main().catch(function (err) {
  console.error('Erro:', err.message);
  process.exit(1);
});
