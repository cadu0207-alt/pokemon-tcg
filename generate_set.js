/**
 * Gerador de card data para MyDeck
 * Uso: node generate_set.js <setId> [usd_to_brl]
 * Ex:  node generate_set.js sv3pt5
 *      node generate_set.js sv1 5.80
 *
 * Sets SV disponíveis:
 *   sv1 sv2 sv3 sv3pt5 sv4 sv4pt5 sv5 sv6 sv6pt5 sv7 sv8 sv8pt5 sv9 sv10
 */

const fs = require('fs');

const SET_ID = process.argv[2];
const USD_BRL = parseFloat(process.argv[3] || '5.80');

if (!SET_ID) {
  console.error('Uso: node generate_set.js <setId>');
  process.exit(1);
}

// ── Mapeamentos ──────────────────────────────────────────────────────────────

const TYPE_PT = {
  Grass:     { pt: 'Planta',    color: '#4CAF50' },
  Fire:      { pt: 'Fogo',      color: '#F44336' },
  Water:     { pt: 'Aquático',  color: '#2196F3' },
  Lightning: { pt: 'Raio',      color: '#FFEB3B' },
  Fighting:  { pt: 'Lutador',   color: '#FF9800' },
  Psychic:   { pt: 'Psíquico',  color: '#9C27B0' },
  Colorless: { pt: 'Incolor',   color: '#9E9E9E' },
  Darkness:  { pt: 'Sombrio',   color: '#607D8B' },
  Metal:     { pt: 'Metal',     color: '#78909C' },
  Dragon:    { pt: 'Dragão',    color: '#3F51B5' },
  Fairy:     { pt: 'Fada',      color: '#E91E63' },
};

const RARE_PT = {
  'Common':                        { pt: 'Comum',                    base: true  },
  'Uncommon':                      { pt: 'Incomum',                  base: true  },
  'Rare':                          { pt: 'Rara',                     base: true  },
  'Rare Holo':                     { pt: 'Rara Holográfica',         base: true  },
  'Rare Holo EX':                  { pt: 'Rara Ultra EX',            base: true  },
  'Rare Holo GX':                  { pt: 'Rara Ultra GX',            base: true  },
  'Rare Holo V':                   { pt: 'Rara Ultra V',             base: true  },
  'Rare Holo VMAX':                { pt: 'Rara Ultra VMAX',          base: true  },
  'Rare Holo VSTAR':               { pt: 'Rara Ultra VSTAR',         base: true  },
  'Double Rare':                   { pt: 'Rara Dupla',               base: true  },
  'Rare Ultra':                    { pt: 'Ultra Rara',               base: false },
  'Ultra Rare':                    { pt: 'Ultra Rara',               base: false },
  'Rare Secret':                   { pt: 'Rara Secreta',             base: false },
  'Rare Rainbow':                  { pt: 'Rara Arco-Íris',           base: false },
  'Rare Shining':                  { pt: 'Rara Brilhante',           base: false },
  'Illustration Rare':             { pt: 'Rara Ilustrada',           base: false },
  'Special Illustration Rare':     { pt: 'Rara Ilustrada Especial',  base: false },
  'Hyper Rare':                    { pt: 'Hiper Rara',               base: false },
  'ACE SPEC Rare':                 { pt: 'ACE SPEC',                 base: false },
  'Shiny Rare':                    { pt: 'Rara Brilhante',           base: false },
  'Shiny Ultra Rare':              { pt: 'Ultra Rara Brilhante',     base: false },
  'Trainer Gallery Rare Holo':     { pt: 'Rara Galeria',             base: false },
  'Promo':                         { pt: 'Promo',                    base: false },
  // ADICIONADO 02/08/2026 (set Ascended Heroes/Heróis Excelsos — primeiro set
  // a usar essas raridades novas): 'Rara Mega Ataque' é o nome oficial em PT
  // confirmado via tcg.pokemon.com/pt-br ("cartas Rara Mega Ataque brilham na
  // expansão"). 'Hiper Rara Mega' é uma tradução provisória (não confirmada
  // em fonte oficial em PT ainda) pro equivalente do "Mega Hyper Rare" (gold
  // etched) — revisar se aparecer o nome oficial depois.
  'MEGA_ATTACK_RARE':              { pt: 'Rara Mega Ataque',         base: false },
  'Mega Attack Rare':              { pt: 'Rara Mega Ataque',         base: false },
  'Mega Hyper Rare':               { pt: 'Hiper Rara Mega',          base: false },
};

// Rarity → preço base BRL aproximado (sem dado de mercado)
const RARE_PRICE_FALLBACK = {
  'Comum':                   0.50,
  'Incomum':                 0.75,
  'Rara':                    1.50,
  'Rara Holográfica':        3.00,
  'Rara Ultra EX':          15.00,
  'Rara Ultra GX':          10.00,
  'Rara Ultra V':           10.00,
  'Rara Ultra VMAX':        15.00,
  'Rara Ultra VSTAR':       15.00,
  'Rara Dupla':             15.00,
  'Ultra Rara':             40.00,
  'Rara Secreta':           50.00,
  'Rara Arco-Íris':         60.00,
  'Rara Ilustrada':         20.00,
  'Rara Ilustrada Especial':80.00,
  'Hiper Rara':            120.00,
  'ACE SPEC':               25.00,
  'Rara Brilhante':         15.00,
  'Ultra Rara Brilhante':  100.00,
  'Rara Galeria':           20.00,
  'Promo':                   5.00,
  'Rara Mega Ataque':      100.00,
  'Hiper Rara Mega':       400.00,
};

// ── Busca da API ─────────────────────────────────────────────────────────────

async function fetchCards(setId) {
  const base = 'https://api.pokemontcg.io/v2/cards';
  const select = 'id,name,number,rarity,types,supertype,tcgplayer,cardmarket,set,nationalPokedexNumbers';
  const pageSize = 250;
  let page = 1, all = [], totalCount = Infinity;
  // NOVO 02/08/2026: paginação — sets com mais de 250 cartas (ex: Ascended
  // Heroes/Heróis Excelsos, 295) perdiam o resto silenciosamente, já que o
  // script antigo só pedia 1 página. A API às vezes devolve vazio numa página
  // válida (instabilidade observada ao testar Ascended Heroes) — retry com
  // pequeno delay antes de desistir dessa página.
  while (all.length < totalCount) {
    const url = `${base}?q=set.id:${setId}&pageSize=${pageSize}&page=${page}&orderBy=number&select=${select}`;
    let pageData = null;
    for (let attempt = 0; attempt < 3 && !pageData; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.data && data.data.length) pageData = data;
      totalCount = data.totalCount ?? totalCount;
    }
    if (!pageData) break; // 3 tentativas vazias — desiste dessa página
    all = all.concat(pageData.data);
    if (pageData.data.length < pageSize) break; // última página
    page++;
  }
  return all;
}

async function fetchSetInfo(setId) {
  const res = await fetch(`https://api.pokemontcg.io/v2/sets/${setId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data;
}

// ── Processamento ────────────────────────────────────────────────────────────

function mapCard(c) {
  const num = c.number.padStart(3, '0');
  const rarity = c.rarity || 'Comum';
  const rarePT = RARE_PT[rarity] || { pt: rarity, base: false };
  const type = (c.types || ['Incolor'])[0];
  const typePT = TYPE_PT[type] || { pt: type, color: '#9E9E9E' };

  // Preço: prefere TCGPlayer market, depois cardmarket trend, depois fallback por raridade
  let price = RARE_PRICE_FALLBACK[rarePT.pt] || 1.00;
  const tcg = c.tcgplayer?.prices;
  const cm  = c.cardmarket?.prices;

  let usdPrice = null;
  if (tcg) {
    usdPrice = tcg.holofoil?.market
            || tcg.normal?.market
            || tcg['1stEditionNormal']?.market
            || tcg.reverseHolofoil?.market
            || null;
  }
  if (usdPrice) {
    price = +(usdPrice * USD_BRL).toFixed(2);
  } else if (cm?.trendPrice) {
    // cardmarket é EUR — usa taxa ~6.30
    price = +(cm.trendPrice * 6.30).toFixed(2);
  }

  if (price < 0.30) price = 0.30;

  const entry = {
    n: num,
    name: c.name,
    type: typePT.pt,
    color: typePT.color,
    rare: rarePT.pt,
    price,
    base: rarePT.base,
  };

  // ADICIONADO 02/08/2026: dex # quando a API tem (cartas de Treinador/Energia
  // não têm nationalPokedexNumbers — ficam sem o campo, igual já acontecia em
  // cards_sv8pt5.js).
  const dex = c.nationalPokedexNumbers?.[0];
  if (dex) entry.dex = dex;

  // Marca cartas importantes (preço > R$50 e não-base)
  if (!rarePT.base && price >= 50) entry.important = true;

  return entry;
}

// ── Geração do arquivo JS ─────────────────────────────────────────────────────

function formatEntry(e) {
  const parts = [
    `n:'${e.n}'`,
  ];
  if (e.dex) parts.push(`dex:${e.dex}`);
  parts.push(
    `name:'${e.name.replace(/'/g, "\\'")}'`,
    `type:'${e.type}'`,
    `color:'${e.color}'`,
    `rare:'${e.rare}'`,
    `price:${e.price}`,
    `base:${e.base}`,
  );
  if (e.important) parts.push('important:true');
  return `  {${parts.join(',')}}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n🔍 Buscando set ${SET_ID}...`);

  let setInfo, cards;
  try {
    [setInfo, cards] = await Promise.all([fetchSetInfo(SET_ID), fetchCards(SET_ID)]);
  } catch (e) {
    console.error('Erro ao buscar API:', e.message);
    process.exit(1);
  }

  if (!cards.length) {
    console.error('Nenhuma carta encontrada para', SET_ID);
    process.exit(1);
  }

  const mapped = cards.map(mapCard);
  const setName = setInfo?.name || SET_ID.toUpperCase();
  const total = setInfo?.total || cards.length;
  const release = setInfo?.releaseDate || '';

  const varName = `CARDS_${SET_ID.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
  const outFile = `cards_${SET_ID}.js`;

  const header = [
    `// ${SET_ID.toUpperCase()} — ${setName} (${total} cartas)`,
    `// Lançamento EN: ${release}`,
    `// Gerado por generate_set.js em ${new Date().toISOString().slice(0,10)}`,
    `// USD/BRL usado: ${USD_BRL}`,
    `// ATENÇÃO: nomes em inglês — traduza para português conforme necessário`,
    `const ${varName} = [`,
  ].join('\n');

  const body = mapped.map(formatEntry).join(',\n');
  const footer = `\n];`;

  // Exporta como variável global (mesmo padrão dos outros arquivos)
  const globalExport = `\n\n// Exporta para uso global\nif(typeof window !== 'undefined') window.${varName} = ${varName};`;

  fs.writeFileSync(outFile, header + '\n' + body + footer + globalExport, 'utf8');

  const withPrice = mapped.filter(c => c.price > 5).length;
  const expensive = mapped.filter(c => c.price >= 50).length;

  console.log(`✅ ${outFile} gerado!`);
  console.log(`   ${mapped.length} cartas | ${withPrice} com preço > R$5 | ${expensive} valiosas (≥R$50)`);
  console.log(`   Variável: ${varName}`);
  console.log(`\n⚠️  Próximos passos:`);
  console.log(`   1. Revise os nomes (estão em inglês)`);
  console.log(`   2. Adicione o set ao app.js`);
  console.log(`   3. git add ${outFile} && git commit -m "feat: add set ${SET_ID}"`);
})();
