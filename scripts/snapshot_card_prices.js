#!/usr/bin/env node
/**
 * snapshot_card_prices.js — Registra um snapshot diário do preço de CADA
 * slot (carta+versão) do catálogo inteiro na tabela `card_price_history`.
 * É a base do gráfico de histórico de preço mostrado na aba Compra/Venda
 * e no popup do Fichário.
 *
 * Diferente de snapshot_value.js (que soma o valor da COLEÇÃO de cada
 * usuário), este script não olha a tabela `collection` — ele só lê os
 * arquivos cards_*.js/legacy_*.js e grava o preço "de tabela" de cada
 * slot, pra todo mundo (não é dado por usuário).
 *
 * Roda via GitHub Actions todo dia (ver .github/workflows/snapshot_card_prices.yml),
 * ou manualmente:
 *     SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/snapshot_card_prices.js
 *     SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/snapshot_card_prices.js --dry-run
 *
 * Reaproveita a mesma técnica de snapshot_value.js: carrega os arquivos
 * de cartas num sandbox de VM (são JS de verdade, não regex) e espelha
 * SET_CARDS_MAP + getSlots() de app.js. Se um set novo for adicionado em
 * app.js, adicionar aqui também (mesma lista que snapshot_value.js).
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
// (idêntico a snapshot_value.js — manter as duas listas em sincronia)

const CARD_FILES = [
  'cards_me04.js', 'cards_me03.js', 'cards_me02.js', 'cards_meg.js',
  'cards_me05.js', 'cards_me06.js', 'cards_mep.js',
  'cards_sv1.js', 'cards_sv2.js', 'cards_sv3.js', 'cards_sv3pt5.js',
  'cards_sv4.js', 'cards_sv4pt5.js', 'cards_sv5.js', 'cards_sv6.js',
  'cards_sv6pt5.js', 'cards_sv7.js', 'cards_sv8.js', 'cards_sv8pt5.js',
  'cards_sv9.js', 'cards_sv10.js', 'cards_svp.js',
  'cards_rsv10pt5.js', 'cards_zsv10pt5.js', 'cards_pgo.js', 'cards_me2pt5.js',
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

const CONST_NAMES = [
  'CARDS', 'CARDS_ME03', 'CARDS_ME02', 'CARDS_MEG', 'CARDS_ME05', 'CARDS_ME06', 'CARDS_MEP',
  'CARDS_SV1', 'CARDS_SV2', 'CARDS_SV3', 'CARDS_SV3PT5', 'CARDS_SV4', 'CARDS_SV4PT5',
  'CARDS_SV5', 'CARDS_SV6', 'CARDS_SV6PT5', 'CARDS_SV7', 'CARDS_SV8', 'CARDS_SV8PT5',
  'CARDS_SV9', 'CARDS_SV10', 'CARDS_SVP', 'CARDS_RSV10PT5', 'CARDS_ZSV10PT5',
  'CARDS_PGO', 'CARDS_ME2PT5',
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
  svp: consts.CARDS_SVP,
  rsv10pt5: consts.CARDS_RSV10PT5,
  zsv10pt5: consts.CARDS_ZSV10PT5,
  pgo: consts.CARDS_PGO,
  me2pt5: consts.CARDS_ME2PT5,
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
(sandbox.LEGACY_SETS || []).forEach(function (ls) {
  if (ls && ls.id && !SET_CARDS_MAP[ls.id]) SET_CARDS_MAP[ls.id] = ls.data || [];
});

// Espelho de getSlots() em app.js -- ATUALIZADO 20/08/2026 pra bater linha a
// linha com o getSlots() real, que tem 2 fixes que este espelho não tinha:
// isLegacySet (24/07/2026, "Rara" nos sets legados NÃO nasce holo, diferente
// de ME/SV) e RARA_HOLO_UNICA_LEGADA (30/07/2026, raridades exclusivas dos
// legados que são slot único SP, não N+RH). Sem isso o gráfico de preço de
// qualquer carta legada com essas raridades mostraria uma versão errada.
// Manter em sincronia se getSlots() mudar de novo no app.js.
const LEGACY_SET_IDS = new Set((sandbox.LEGACY_SETS || []).map(function (ls) { return ls && ls.id; }));
const RARA_HOLO_UNICA_LEGADA = [
  'Rara Holo EX', 'Rara Holo GX', 'Rara Holo V', 'Rara Holo VMAX', 'Rara Holo VSTAR',
  'Rara Holo LV.X', 'Rara BREAK', 'Rara Incrível', 'Rara Radiante', 'Rara Rainbow',
  'Rara Secreta', 'Rara Shiny', 'Rara Shiny GX', 'Rara Shiny V', 'Rara Star', 'Rara Prime',
];
function getSlotsForSnapshot(c, setId) {
  const r = c.rare || '';
  if (!c.base) return [{ ver: 'SP', price: c.price }];
  if (r.includes('Dupla') || r.includes('RR')) return [{ ver: 'F', price: c.price }];
  const isLegacySet = LEGACY_SET_IDS.has(setId);
  if ((r === 'Rara' && !isLegacySet) || r === 'Rara Holo' || r === 'Rara Brilhante' || r === 'Rara Ilustrada' || r === 'Rara Ilustrada Especial') {
    return [
      { ver: 'F', price: c.priceF || c.price },
      { ver: 'RH', price: c.priceRH || (c.price ? +(c.price * 1.2).toFixed(2) : null) },
    ];
  }
  if (RARA_HOLO_UNICA_LEGADA.includes(r)) return [{ ver: 'SP', price: c.price }];
  if (setId === 'mep' || setId === 'svp') return [{ ver: 'SP', price: c.price }];
  return [
    { ver: 'N', price: c.price },
    { ver: 'RH', price: c.priceRH || (c.price ? +(c.price * 1.2).toFixed(2) : null) },
  ];
}

// ---- 2. Monta as linhas do snapshot (um slot = uma linha) ------------------

function todayBRT() {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  return brt.toISOString().slice(0, 10);
}

const date = todayBRT();
const rows = [];
let totalCardsLoaded = 0;

for (const setId of Object.keys(SET_CARDS_MAP)) {
  const cards = SET_CARDS_MAP[setId] || [];
  cards.forEach(function (c) {
    if (!c || !c.n) return;
    totalCardsLoaded++;
    const slots = getSlotsForSnapshot(c, setId);
    slots.forEach(function (s) {
      const price = Number(s.price) || 0;
      if (!price) return; // não grava linha de preço zerado/indefinido — não é dado real
      rows.push({
        slot_key: setId + ':' + c.n + ':' + s.ver,
        set_id: setId,
        card_n: c.n,
        version: s.ver,
        card_name: c.name || null,
        price: price,
        date: date,
      });
    });
  });
}

console.log(totalCardsLoaded + ' cartas carregadas em ' + Object.keys(SET_CARDS_MAP).length + ' colecoes -- ' + rows.length + ' slots com preco a gravar (data BRT: ' + date + ')' + (DRY_RUN ? ' (DRY-RUN)' : ''));

if (DRY_RUN) {
  console.log('Amostra (5 primeiras linhas):');
  rows.slice(0, 5).forEach(r => console.log('  ', r));
  console.log('DRY-RUN -- nada foi gravado.');
  process.exit(0);
}

// ---- 3. Grava em card_price_history (lotes de 1000, upsert por PK) --------

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

async function main() {
  if (!rows.length) {
    console.log('Nenhum slot com preco valido -- nada a gravar.');
    return;
  }
  const BATCH = 1000;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sbFetch('card_price_history', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(batch),
    });
    written += batch.length;
    console.log('  gravado lote ' + written + '/' + rows.length);
  }
  console.log(written + ' snapshots de preco gravados em card_price_history para ' + date + '.');
}

main().catch(function (err) {
  console.error('Erro:', err.message);
  process.exit(1);
});
