#!/usr/bin/env node
/**
 * backfill_card_price_history.js — reconstrói, a partir do HISTÓRICO DO GIT, o histórico de preço
 * (card_price_history) dos dias em que o snapshot diário só gravou parte do catálogo.
 *
 * CONTEXTO: de 20/08 a 02/10/2026 o snapshot gravava só 10.000 das ~33.400 linhas por dia (bug do
 * cel25c:15 repetido — corrigido no snapshot_card_prices.js), então só 37 de 150 sets têm histórico.
 * Os preços do catálogo vivem nos arquivos cards_*.js / legacy_*.js e só mudam quando alguém commita
 * (atualização local → commit), então o estado de preços de cada dia É recuperável: é o conteúdo desses
 * arquivos no HEAD às 00:10 de Brasília (03:10 UTC) daquele dia — exatamente o que o snapshot leria.
 * Validado em 03/10/2026: soma de preços por set bate com o banco, ao centavo (42/42).
 *
 * COMPACTO: o histórico guarda só o 1º preço de cada slot e as MUDANÇAS (ver
 * card_price_history_compacto_03out2026.sql). Este script gera exatamente isso: para cada slot, uma linha
 * no 1º dia e em cada dia em que o preço mudou. Insere com "ignore-duplicates" — NUNCA sobrescreve linha que
 * já existe no banco.
 *
 * Uso (precisa de clone com histórico completo: actions/checkout com fetch-depth: 0):
 *     node scripts/backfill_card_price_history.js                  # SIMULAÇÃO (só mostra o que faria)
 *     SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/backfill_card_price_history.js --write
 *   opções: --from=2026-08-20  --to=2026-10-02   (padrão)
 *
 * Reaproveita a lógica de montagem de linhas do snapshot_card_prices.js (lê o código dele e executa até o
 * "if (DRY_RUN)"): se mexer nessa estrutura lá, ajuste aqui.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.dirname(__dirname);
const WRITE = process.argv.includes('--write');
const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const FROM = arg('from', '2026-08-20');
const TO = arg('to', '2026-10-02');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (WRITE && !SERVICE_KEY) { console.error('Faltou a env SUPABASE_SERVICE_ROLE_KEY (necessária com --write).'); process.exit(1); }

const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

// ── lógica de montagem de linhas = a do snapshot_card_prices.js ──
const snapSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'snapshot_card_prices.js'), 'utf8').replace(/\r\n/g, '\n').replace(/^#!.*\n/, '');
const cut = snapSrc.indexOf('if (DRY_RUN)');
if (cut < 0) { console.error('Não achei "if (DRY_RUN)" no snapshot_card_prices.js — a estrutura mudou, ajuste este script.'); process.exit(1); }
const CARD_FILES = [...snapSrc.match(/const CARD_FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

function stateAt(sha) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scripts'));
    for (const f of CARD_FILES) {
      let buf;
      try { buf = git(['show', `${sha}:${f}`]); } catch (e) { continue; } // set ainda não existia nesse commit
      fs.writeFileSync(path.join(tmp, f), buf);
    }
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY || 'dummy';
    const fn = new Function('require', 'process', '__dirname', 'console', snapSrc.slice(0, cut) + '\nreturn rows;');
    const rows = fn(require, process, path.join(tmp, 'scripts'), { log() {}, error() {} });
    const m = new Map(); // dedup por slot_key (última vence), igual ao snapshot
    rows.forEach((r) => m.set(r.slot_key, r));
    return m;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── commits que mexeram nos arquivos de carta (+ o último antes do período) ──
const since = new Date(new Date(FROM + 'T00:00:00Z').getTime() - 3 * 86400000).toISOString().slice(0, 10);
const touched = git(['log', '--reverse', '--format=%H|%cI', '--since=' + since, '--', ...CARD_FILES])
  .toString().trim().split('\n').filter(Boolean).map((l) => { const [sha, iso] = l.split('|'); return { sha, t: new Date(iso).getTime() }; });
const base = git(['log', '-1', '--format=%H|%cI', '--before=' + since, '--', ...CARD_FILES]).toString().trim();
if (base) { const [sha, iso] = base.split('|'); touched.unshift({ sha, t: new Date(iso).getTime() }); }
if (!touched.length) { console.error('Nenhum commit encontrado — o clone tem histórico completo (fetch-depth: 0)?'); process.exit(1); }
console.log(touched.length + ' commit(s) candidatos a partir de ' + since + '.');

const states = [];
for (const c of touched) {
  try { states.push({ ...c, map: stateAt(c.sha) }); }
  catch (e) { console.log('  pulando commit ' + c.sha.slice(0, 8) + ' (arquivo de carta quebrado nesse commit: ' + String(e.message).split('\n')[0].slice(0, 70) + ')'); }
}

// ── dia a dia: estado = último commit com horário <= 03:10 UTC do dia ──
const out = [];            // linhas a inserir
const prevPrice = new Map(); // slot_key -> último preço emitido
let lastSha = null;
const porDia = [];
for (let d = new Date(FROM + 'T03:10:00Z'), end = new Date(TO + 'T03:10:00Z'); d <= end; d = new Date(d.getTime() + 86400000)) {
  const date = d.toISOString().slice(0, 10);
  let pick = null;
  for (const s of states) if (s.t <= d.getTime()) pick = s;
  if (!pick) { console.log('  ' + date + ': sem estado no git — pulando'); continue; }
  let n = 0;
  if (pick.sha !== lastSha) { // estado igual ao do dia anterior ⇒ nenhuma mudança a registrar
    for (const [k, r] of pick.map) {
      const p = prevPrice.get(k);
      if (p === undefined || Math.round(p * 100) !== Math.round(r.price * 100)) {
        out.push({ slot_key: k, set_id: r.set_id, card_n: r.card_n, version: r.version, card_name: r.card_name, price: r.price, date });
        prevPrice.set(k, r.price); n++;
      }
    }
    lastSha = pick.sha;
  }
  porDia.push(date + ':' + n);
}
console.log('linhas por dia (só dias com mudança): ' + porDia.filter((x) => !x.endsWith(':0')).join('  '));
console.log('TOTAL a inserir: ' + out.length.toLocaleString('pt-BR') + ' linhas (~' + (out.length * 186 / 1048576).toFixed(1) + ' MB no banco, 186 bytes/linha).');

if (!WRITE) {
  console.log('\nSIMULAÇÃO — nada foi gravado. Amostra:');
  out.slice(0, 3).forEach((r) => console.log('  ', JSON.stringify(r)));
  console.log('Para gravar de verdade: rode de novo com --write (no workflow: marque "gravar").');
  process.exit(0);
}

(async () => {
  const BATCH = 1000;
  let written = 0, failed = 0;
  for (let i = 0; i < out.length; i += BATCH) {
    const batch = out.slice(i, i + BATCH);
    const r = await fetch(SUPABASE_URL + '/rest/v1/card_price_history', {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json',
        // NUNCA sobrescreve o que já existe (a linha do snapshot diário real tem prioridade)
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (r.ok) { written += batch.length; console.log('  lote ' + (i / BATCH + 1) + ' ok (' + written + '/' + out.length + ')'); }
    else { failed++; console.error('  FALHOU lote ' + (i / BATCH + 1) + ': HTTP ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200)); }
  }
  console.log('Concluído: ' + written + ' linhas enviadas (as que já existiam foram ignoradas), ' + failed + ' lote(s) com falha.');
  process.exit(failed ? 1 : 0);
})();
