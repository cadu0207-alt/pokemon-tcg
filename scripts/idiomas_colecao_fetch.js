// FERRAMENTA (04/10/2026): fecha PT/EN/JP de uma coleção ME — ver memória/cabeçalho de cards_me05.js e cards_me04.js.
// Passo 1 (este): coleta. Depois: node scripts/idiomas_colecao_patch.js <cards_*.js> <data.json> [--rename=..] [--keep-name=..] [--type=..].
// O data.json sai no diretório deste script (scratch); não vai pro site.
// Coleta genérica para fechar PT/EN/JP de uma coleção ME.
// Uso: node mset_fetch.js <LIMITLESS> <tcgdexSlug> <jpMain> <total> <outPrefix>
//   ex: node mset_fetch.js CRI me04 M4 122 me04
// Gera <outPrefix>_data.json com, por carta intl: ref JP, nameJp, img (verificada), artist (intl/jp/tcgdex), nomes pt/en.
const fs = require('fs');
const [LIM, SLUG, JPMAIN, TOTAL, PREFIX] = process.argv.slice(2);
const N = +TOTAL;
const SP = __dirname + '/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'Mozilla/5.0' };
const get = async (u, asJson) => {
  for (let a = 0; a < 4; a++) {
    try { const r = await fetch(u, { headers: UA }); if (r.ok) return asJson ? await r.json() : await r.text(); } catch (e) {}
    await sleep(1200);
  }
  return null;
};
const ART = /card-text-artist[^>]*>\s*Illustrated by\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/;

(async () => {
  const ptSet = await get(`https://api.tcgdex.net/v2/pt/sets/${SLUG}`, true);
  const enSet = await get(`https://api.tcgdex.net/v2/en/sets/${SLUG}`, true);
  const pt = Object.fromEntries(ptSet.cards.map((c) => [+c.localId, c.name]));
  const en = Object.fromEntries(enSet.cards.map((c) => [+c.localId, c.name]));
  const jaSet = await get(`https://api.tcgdex.net/v2/ja/sets/${JPMAIN}`, true);
  const ja = Object.fromEntries((jaSet ? jaSet.cards : []).map((c) => [+c.localId, c.name]));

  // 1) página intl: JP prints + ilustrador
  const intl = {};
  for (let n = 1; n <= N; n++) {
    const html = await get(`https://limitlesstcg.com/cards/${LIM}/${n}`);
    if (!html) { intl[n] = { error: true, jp: [] }; continue; }
    const i = html.indexOf('JP. Prints');
    const seg = i >= 0 ? html.slice(i, html.indexOf('</table>', i)) : '';
    const jp = [...seg.matchAll(/href="\/cards\/jp\/([A-Za-z0-9]+)\/(\d+)"/g)].map((m) => m[1] + '/' + m[2]);
    intl[n] = { jp, artist: (html.match(ART) || [])[1] || null };
    await sleep(200);
  }

  // 2) mapa intl -> JP (prints do set principal; n-ésimo ↔ n-ésimo)
  const groups = {};
  for (let n = 1; n <= N; n++) {
    const m = intl[n].jp.filter((x) => x.startsWith(JPMAIN + '/')).map((x) => +x.split('/')[1]).sort((a, b) => a - b);
    (groups[m.join(',')] = groups[m.join(',')] || []).push(n);
  }
  const ref = {}; const notes = [];
  for (const [k, ns] of Object.entries(groups)) {
    const jp = k ? k.split(',').map(Number) : [];
    ns.sort((a, b) => a - b);
    if (!jp.length) {
      ns.forEach((n) => {
        const other = intl[n].jp.filter((x) => !x.startsWith(JPMAIN + '/'));
        if (other.length) { ref[n] = other[0]; notes.push(`#${n} (${pt[n]}): sem print ${JPMAIN}; usei ${other[0]} (opções: ${other.slice(0, 4).join(', ')})`); }
        else notes.push(`#${n} (${pt[n]}): SEM print JP`);
      });
      continue;
    }
    if (jp.length !== ns.length) notes.push(`contagem diverge: intl ${ns.join(',')} (${pt[ns[0]]}) x ${JPMAIN} ${jp.join(',')}`);
    ns.forEach((n, i) => { if (i < jp.length) ref[n] = JPMAIN + '/' + jp[i]; else notes.push(`#${n} (${pt[n]}): print extra sem par no JP`); });
  }

  // 3) páginas JP: nome, ilustrador, imagem verificada; tcgdex: ilustrador
  const out = {}; const problems = [];
  for (let n = 1; n <= N; n++) {
    const r = ref[n];
    const rec = { n, pt: pt[n] || null, en: en[n] || null, artistIntl: intl[n].artist };
    const t = await get(`https://api.tcgdex.net/v2/en/sets/${SLUG}/${String(n).padStart(3, '0')}`, true);
    rec.artistTcgdex = t ? t.illustrator || null : undefined;
    if (r) {
      const [set, num] = r.split('/');
      const html = await get(`https://limitlesstcg.com/cards/jp/${set}/${num}`);
      rec.ref = r;
      rec.nameJp = html ? ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').split(' - ')[0].trim() : '';
      rec.artistJp = html ? (html.match(ART) || [])[1] || null : null;
      rec.img = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${set}/${set}_${num}_R_JP_LG.png`;
      try { const h = await fetch(rec.img, { method: 'HEAD' }); rec.imgOk = h.ok && /image/.test(h.headers.get('content-type') || ''); } catch (e) { rec.imgOk = false; }
      if (set === JPMAIN && ja[num] && ja[num] !== rec.nameJp) problems.push(`#${n}: nome limitless "${rec.nameJp}" != tcgdex "${ja[num]}"`);
      if (!rec.nameJp) problems.push(`#${n}: sem nome JP (${r})`);
      if (!rec.imgOk) problems.push(`#${n}: imagem não ok ${rec.img}`);
      if (rec.artistJp && rec.artistIntl && rec.artistJp.toLowerCase() !== rec.artistIntl.toLowerCase()) problems.push(`#${n}: ilustrador intl "${rec.artistIntl}" != jp "${rec.artistJp}"`);
    }
    if (rec.artistTcgdex !== undefined && (rec.artistTcgdex || null) !== (rec.artistIntl || null)) problems.push(`#${n}: ilustrador intl "${rec.artistIntl}" != tcgdex "${rec.artistTcgdex}"`);
    out[n] = rec;
    await sleep(120);
  }
  fs.writeFileSync(SP + PREFIX + '_data.json', JSON.stringify(out, null, 1));
  const mapped = Object.keys(ref).length;
  const usedJp = new Set(Object.values(ref).filter((x) => x.startsWith(JPMAIN + '/')).map((x) => +x.split('/')[1]));
  console.log(`cartas intl ${N} | mapeadas ${mapped} | JP ${JPMAIN} total ${Object.keys(ja).length}, sem par no intl: ${Object.keys(ja).filter((j) => !usedJp.has(+j)).join(',') || '-'}`);
  console.log('NOTAS:'); notes.forEach((x) => console.log(' *', x));
  console.log('PROBLEMAS:', problems.length); problems.slice(0, 40).forEach((x) => console.log(' -', x));
})();
