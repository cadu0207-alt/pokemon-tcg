// FERRAMENTA (04/10/2026): depois do fetch, p/ cartas cujo print JP tem ilustrador diferente do intl (reimpressão com arte nova),
// procura entre TODOS os prints JP um com o mesmo ilustrador; senão marca sem JP. node scripts/idiomas_colecao_fix.js <LIMITLESS> <prefixo> <jpMain> [n1,n2]
// Para cartas cujo print JP escolhido tem ilustrador diferente do intl: procura entre TODOS os prints JP da carta
// um com o mesmo ilustrador (mesma arte). Se não achar, marca sem JP.
// Uso: node mset_fix.js <LIMITLESS> <prefixo> <jpMain> [n1,n2,...]  (sem lista = todas com divergência)
const fs = require('fs');
const [LIM, PREFIX, JPMAIN, ONLY] = process.argv.slice(2);
const SP = __dirname + '/';
const d = JSON.parse(fs.readFileSync(SP + PREFIX + '_data.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { for (let a = 0; a < 4; a++) { try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (r.ok) return await r.text(); } catch (e) {} await sleep(1200); } return null; };
const ART = /card-text-artist[^>]*>\s*Illustrated by\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const only = ONLY ? new Set(ONLY.split(',').map(Number)) : null;
(async () => {
  const targets = Object.values(d).filter((r) => (only ? only.has(r.n) : r.ref && r.artistJp && r.artistIntl && norm(r.artistJp) !== norm(r.artistIntl)));
  for (const r of targets) {
    const html = await get(`https://limitlesstcg.com/cards/${LIM}/${r.n}`);
    const i = html.indexOf('JP. Prints');
    const seg = i >= 0 ? html.slice(i, html.indexOf('</table>', i)) : '';
    const opts = [...seg.matchAll(/href="\/cards\/jp\/([A-Za-z0-9]+)\/(\d+)"/g)].map((m) => m[1] + '/' + m[2]);
    // M principal primeiro, depois MP, depois o resto
    opts.sort((a, b) => (a.startsWith(JPMAIN + '/') ? 0 : a.startsWith('MP/') ? 1 : 2) - (b.startsWith(JPMAIN + '/') ? 0 : b.startsWith('MP/') ? 1 : 2));
    let found = null;
    for (const o of opts) {
      const [s, n] = o.split('/');
      const h = await get(`https://limitlesstcg.com/cards/jp/${s}/${n}`);
      const a = h && (h.match(ART) || [])[1];
      if (a && norm(a) === norm(r.artistIntl)) {
        const nameJp = ((h.match(/<title>([^<]*)<\/title>/) || [])[1] || '').split(' - ')[0].trim();
        const img = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${s}/${s}_${n}_R_JP_LG.png`;
        const hh = await fetch(img, { method: 'HEAD' }).catch(() => null);
        if (hh && hh.ok && /image/.test(hh.headers.get('content-type') || '')) { found = { ref: o, nameJp, img, artistJp: a }; break; }
      }
      await sleep(120);
    }
    console.log(`#${r.n} ${r.pt} (intl "${r.artistIntl}"): ${found ? 'achei ' + found.ref : 'NENHUM print JP com a mesma arte (' + opts.length + ' testados)'}`);
    if (found) Object.assign(r, found, { imgOk: true }); else { r.noJp = true; delete r.nameJp; delete r.img; delete r.ref; delete r.artistJp; }
  }
  fs.writeFileSync(SP + PREFIX + '_data.json', JSON.stringify(d, null, 1));
})();
