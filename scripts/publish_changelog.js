#!/usr/bin/env node
/**
 * publish_changelog.js — Publica automaticamente no mural de Atualizações
 * (tabela `site_updates`) toda entrada nova encontrada em changelog/*.md.
 *
 * Fluxo pretendido: em vez de colar manualmente cada entrada no formulário
 * admin do site (updates.js / publishUpdate()), a gente só cria um arquivo
 * .md dentro de changelog/ com o título+mensagem e dá push — o GitHub
 * Action (.github/workflows/publish_changelog.yml) roda esse script, que
 * publica direto no Supabase usando a service_role key (bypassa a RLS que
 * normalmente exige estar logado como o Eduardo — aqui não tem sessão de
 * usuário nenhuma, é 100% servidor).
 *
 * Roda via GitHub Actions a cada push em changelog/**, ou manualmente:
 *     SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/publish_changelog.js
 *     SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/publish_changelog.js --dry-run
 *
 * Formato de um arquivo changelog/AAAA-MM-DD-slug.md:
 *
 *   ---
 *   title: ⚡ Marcação rápida por versão no Fichário
 *   ---
 *   Inspirado no pkmn.gg: os pontinhos coloridos embaixo de cada carta...
 *
 * Controle de idempotência: changelog/.published.json guarda a lista de
 * arquivos já publicados (por nome) — o workflow commita esse arquivo de
 * volta no repo depois de publicar, pra nunca duplicar entrada mesmo se
 * o job rodar de novo.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.dirname(__dirname);
const CHANGELOG_DIR = path.join(REPO_ROOT, 'changelog');
const PUBLISHED_FILE = path.join(CHANGELOG_DIR, '.published.json');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dvkiodmhtzlkvmyyzelx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SERVICE_KEY) {
  console.error('Faltou a env SUPABASE_SERVICE_ROLE_KEY (Settings -> API -> service_role no painel do Supabase).');
  process.exit(1);
}

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

// Parser bem simples de front-matter (--- title: X --- corpo), sem depender
// de nenhuma lib externa (o job não roda `npm install`).
function parseChangelogFile(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return null;
  const fmBlock = m[1];
  const body = m[2].trim();
  let title = null;
  fmBlock.split('\n').forEach(function (line) {
    const mm = line.match(/^title:\s*(.+)$/);
    if (mm) title = mm[1].trim();
  });
  if (!title || !body) return null;
  return { title: title, message: body };
}

async function main() {
  if (!fs.existsSync(CHANGELOG_DIR)) {
    console.log('Pasta changelog/ não existe ainda — nada pra publicar.');
    return;
  }

  let published = {};
  if (fs.existsSync(PUBLISHED_FILE)) {
    try { published = JSON.parse(fs.readFileSync(PUBLISHED_FILE, 'utf8')); } catch (e) { published = {}; }
  }

  const files = fs.readdirSync(CHANGELOG_DIR)
    .filter(function (f) { return f.endsWith('.md') && !published[f]; })
    .sort(); // nomes começam com AAAA-MM-DD, então ordem alfabética = ordem cronológica

  if (!files.length) {
    console.log('Nenhum arquivo novo em changelog/ — nada pra publicar.');
    return;
  }

  console.log(files.length + ' arquivo(s) novo(s): ' + files.join(', '));

  for (const f of files) {
    const raw = fs.readFileSync(path.join(CHANGELOG_DIR, f), 'utf8');
    const parsed = parseChangelogFile(raw);
    if (!parsed) {
      console.warn('  [pulado] ' + f + ' — não achei "title:" no front-matter ou corpo vazio.');
      continue;
    }
    if (parsed.title.length > 80) {
      console.warn('  [aviso] ' + f + ' — título com mais de 80 caracteres, truncando.');
      parsed.title = parsed.title.slice(0, 80);
    }
    if (parsed.message.length > 400) {
      console.warn('  [aviso] ' + f + ' — mensagem com mais de 400 caracteres, truncando.');
      parsed.message = parsed.message.slice(0, 400);
    }

    console.log('  Publicando ' + f + ': "' + parsed.title + '"');
    if (!DRY_RUN) {
      await sbFetch('site_updates', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ title: parsed.title, message: parsed.message }),
      });
    }
    published[f] = new Date().toISOString();
  }

  if (!DRY_RUN) {
    fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(published, null, 2) + '\n');
    console.log('Atualizado ' + path.relative(REPO_ROOT, PUBLISHED_FILE) + '.');
  } else {
    console.log('[dry-run] não gravei nada no Supabase nem no .published.json.');
  }
}

main().catch(function (e) {
  console.error('Erro: ' + e.message);
  process.exit(1);
});
