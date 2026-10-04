// FERRAMENTA (04/10/2026): aplica o data.json do idiomas_colecao_fetch.js num cards_*.js (nameEn/nameJp/img/artist). Preserva CRLF/LF.
// Aplica os dados coletados (mset_fetch.js) num cards_*.js: nameEn / nameJp / img, nomes PT errados e artist.
// Uso: node mset_patch.js <arquivo cards_*.js> <data.json> [--rename=082,083,...] [--keep-name=122,113,115] [--type=083:Item:#5C6BC0]
const fs = require('fs');
const [FILE, DATA, ...opts] = process.argv.slice(2);
const opt = (k) => (opts.find((o) => o.startsWith('--' + k + '=')) || '').split('=')[1] || '';
const rename = new Set(opt('rename').split(',').filter(Boolean).map(Number));
const keep = new Set(opt('keep-name').split(',').filter(Boolean).map(Number));
const typeFix = Object.fromEntries(opt('type').split(';').filter(Boolean).map((x) => { const [n, t, c] = x.split(':'); return [+n, { t, c }]; }));
const d = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const raw = fs.readFileSync(FILE, 'utf8');
const crlf = raw.includes('\r\n');
const q = (s) => JSON.stringify(s);
const SUF = /( \((?:IR|UR|SAR|F)\))$/;
const stats = { rows: 0, nameEn: 0, renamed: [], artistFix: 0, artistAdd: 0, artistDel: [], typeFix: [] };
const out = raw.split(crlf ? '\r\n' : '\n').map((ln) => {
  const m = ln.match(/^(\s*\{n:'(\d{3})',)(dex:\d+,)?(artist:(?:'[^']*'|"[^"]*"),)?name:('([^']*)'|"([^"]*)")(,.*)$/);
  if (!m) return ln;
  const n = +m[2]; const r = d[n];
  if (!r || !r.nameJp || !r.img) throw new Error('sem dado JP para ' + n);
  const local = m[6] !== undefined ? m[6] : m[7];
  const suf = (local.match(SUF) || [''])[0];
  let name = local;
  if (rename.has(n)) { name = r.pt + suf; stats.renamed.push(m[2] + ': ' + local + ' -> ' + name); }
  let nameEn = '';
  if (!keep.has(n) && r.en && r.en !== r.pt) { nameEn = ',nameEn:' + q(r.en + suf); stats.nameEn++; }
  // ilustrador (intl = jp = tcgdex na maioria; intl é a referência)
  const had = m[4] ? m[4].slice(7, -1).replace(/^['"]|['"]$/g, '') : null;
  const next = r.artistIntl || null;
  let art = m[4] || '';
  if (had !== next) { art = next ? 'artist:' + q(next) + ',' : ''; if (!next) stats.artistDel.push(m[2]); else if (had) stats.artistFix++; else stats.artistAdd++; }
  let rest = m[8];
  if (typeFix[n]) {
    rest = rest.replace(/,type:'[^']*',color:'#[0-9A-Fa-f]{6}'/, `,type:'${typeFix[n].t}',color:'${typeFix[n].c}'`);
    stats.typeFix.push(m[2] + ' -> ' + typeFix[n].t);
  }
  stats.rows++;
  return m[1] + (m[3] || '') + art + 'name:' + q(name) + nameEn + ',nameJp:' + q(r.nameJp) + ',img:' + q(r.img) + rest;
});
fs.writeFileSync(FILE, out.join(crlf ? '\r\n' : '\n'));
console.log(JSON.stringify(stats, null, 1));
