// MEP — Black Star Promos (TODAS as promocionais da série Mega Evolution, não só First Partner)
// MEP001–036: promos anteriores ao First Partner — staff/prerelease, Pokémon Center,
//   jumbo (produtos ex), stamped — confirmado via Bulbapedia (checklist oficial, jul/2026)
// Série 1: MEP037–045 (Kanto, Sinnoh, Alola) — lançamento 30/03/2026
// Série 2: MEP046–054 (Johto, Unova, Galar) — lançamento 19/06/2026 — CONFIRMADO via Serebii.net
// Série 3: MEP055–063 (Hoenn, Kalos, Paldea) — CONFIRMADO via Serebii.net (checklist), ainda sem
//   preço de mercado BR no momento da inclusão (09/jul/2026) — usar como estimativa até haver venda real
// MEP064–081 (exceto 081, arte ainda não revelada): produtos de Ordem Perfeita/Caos Ascendente
// Categoria: Promos exclusivos, não pertencem a nenhum set regular
// Preços: estimativas de mercado BR (jun/2026) — set completo S1 ~R$700 no MYP Cards
// NOTA sobre 001–036: preços são estimativas conservadoras por raridade/produto de origem —
// a maioria não circula no mercado BR (vieram de ETB/box/torneio, não de blister avulso).
// Ajustar quando houver referência de venda real. Fontes: bulbapedia.bulbagarden.net/wiki/MEP_Black_Star_Promos_(TCG)
//   e serebii.net/card/megapromos (checklist numerado oficial, consultado em 09/jul/2026)
//
// MEP082–110: CONFIRMADO e completo via Serebii.net (dados de carta + checklist, 09/jul/2026).
// Gaps confirmados (arte ainda não revelada, não incluídos): #81 e #86–91.
// Checklist oficial do Serebii vai de #1 até #110 — catálogo MEP 100% completo neste arquivo.
const CARDS_MEP = [
  // ── PROMOS MEP001–036 (produtos diversos, set/torneio da série Mega Evolution) ──
  {n:'001',name:'Meganium',type:'Grama',color:'#4CAF50',rare:'Promo (Staff)',price:34.99,base:false,series:'Promos MEP 001–036'},
  {n:'002',name:'Inteleon',type:'Aquático',color:'#2196F3',rare:'Promo (Staff)',price:7.75,base:false,series:'Promos MEP 001–036'},
  {n:'003',name:'Alakazam',type:'Psíquico',color:'#9C27B0',rare:'Promo (Staff)',price:42.00,base:false,series:'Promos MEP 001–036'},
  {n:'004',name:'Lunatone',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:37.99,base:false,series:'Promos MEP 001–036'},
  {n:'005',name:'Drifloon',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.45,base:false,series:'Promos MEP 001–036'},
  {n:'006',name:'Drifblim',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.34,base:false,series:'Promos MEP 001–036'},
  {n:'007',name:'Psyduck',type:'Aquático',color:'#2196F3',rare:'Promo',price:1.50,base:false,series:'Promos MEP 001–036'},
  {n:'008',name:'Golduck',type:'Aquático',color:'#2196F3',rare:'Promo',price:0.89,base:false,series:'Promos MEP 001–036'},
  {n:'009',name:'Alakazam',type:'Psíquico',color:'#9C27B0',rare:'Promo (Pokémon Center)',price:119.00,base:false,series:'Promos MEP 001–036'},
  {n:'010',name:'Riolu',type:'Lutador',color:'#795548',rare:'Promo (Pokémon Center)',price:104.90,base:false,series:'Promos MEP 001–036'},
  {n:'011',name:'Mega Latias ex',type:'Dragão',color:'#7C4DFF',rare:'Promo (Jumbo)',price:5.00,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'012',name:'Mega Lucario ex',type:'Lutador',color:'#795548',rare:'Promo (Jumbo)',price:7.60,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'013',name:'Mega Venusaur ex',type:'Grama',color:'#4CAF50',rare:'Promo (Jumbo)',price:6.30,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'014',name:'Ceruledge',type:'Fogo',color:'#F44336',rare:'Promo (Staff)',price:14.90,base:false,series:'Promos MEP 001–036'},
  {n:'015',name:'Zacian',type:'Psíquico',color:'#9C27B0',rare:'Promo (Staff)',price:9.00,base:false,series:'Promos MEP 001–036'},
  {n:'016',name:'Flygon',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:11.90,base:false,series:'Promos MEP 001–036'},
  {n:'017',name:'Toxtricity',type:'Escuridão',color:'#212121',rare:'Promo (Staff)',price:18.90,base:false,series:'Promos MEP 001–036'},
  {n:'018',name:'Cottonee',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.40,base:false,series:'Promos MEP 001–036'},
  {n:'019',name:'Whimsicott',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.40,base:false,series:'Promos MEP 001–036'},
  {n:'020',name:'Sneasel',type:'Escuridão',color:'#212121',rare:'Promo',price:0.40,base:false,series:'Promos MEP 001–036'},
  {n:'021',name:'Weavile',type:'Escuridão',color:'#212121',rare:'Promo',price:0.40,base:false,series:'Promos MEP 001–036'},
  {n:'022',name:'Charcadet',type:'Fogo',color:'#F44336',rare:'Promo (Pokémon Center)',price:20.99,base:false,series:'Promos MEP 001–036'},
  {n:'023',name:'Mega Charizard X ex',type:'Fogo',color:'#F44336',rare:'Promo (UPC)',price:99.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'024',name:'Oricorio ex',type:'Fogo',color:'#F44336',rare:'Promo (UPC)',price:28.00,base:false,series:'Promos MEP 001–036'},
  {n:'025',name:'Mega Kangaskhan ex',type:'Incolor',color:'#9E9E9E',rare:'Promo (Jumbo)',price:9.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'026',name:'Meloetta',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:24.00,base:false,series:'Promos MEP 001–036'},
  {n:'027',name:'Haunter',type:'Escuridão',color:'#212121',rare:'Promo',price:100.00,base:false,series:'Promos MEP 001–036'},
  {n:'028',name:'Celebratory Fanfare',type:'Treinador',color:'#607D8B',rare:'Promo (Stamped)',price:100.00,base:false,series:'Promos MEP 001–036'},
  {n:'029',name:'Mega Charizard X ex',type:'Fogo',color:'#F44336',rare:'Promo (Tin)',price:18.39,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'030',name:'Mega Charizard Y ex',type:'Fogo',color:'#F44336',rare:'Promo (Tin)',price:19.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'031',name:"N's Zekrom",type:'Raio',color:'#FFC107',rare:'Promo (Pokémon Center)',price:42.90,base:false,series:'Promos MEP 001–036'},
  {n:'032',name:'Mega Gardevoir ex',type:'Psíquico',color:'#9C27B0',rare:'Promo (Poster)',price:40.00,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'033',name:'Mega Lucario ex',type:'Lutador',color:'#795548',rare:'Promo (Poster)',price:69.00,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'034',name:'Mega Meganium ex',type:'Grama',color:'#4CAF50',rare:'Promo (Jumbo)',price:7.20,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'035',name:'Mega Emboar ex',type:'Fogo',color:'#F44336',rare:'Promo (Jumbo)',price:7.84,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'036',name:'Mega Feraligatr ex',type:'Aquático',color:'#2196F3',rare:'Promo (Jumbo)',price:8.10,base:false,important:true,series:'Promos MEP 001–036'},
  // SÉRIE 1 — Kanto (MEP037–039)
  // Charmander > Bulbasaur > Squirtle em popularidade; referência USD: ~$44/$37/$34
  {n:'037',name:'Bulbasaur',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:72.89,base:true,important:true,series:'Série 1 — Kanto'},
  {n:'038',name:'Charmander',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:99.00,base:true,important:true,series:'Série 1 — Kanto'},
  {n:'039',name:'Squirtle',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:69.89,base:true,important:true,series:'Série 1 — Kanto'},
  // SÉRIE 1 — Sinnoh (MEP040–042)
  // Piplup > Chimchar > Turtwig; Piplup tem maior fanbase
  {n:'040',name:'Turtwig',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:29.90,base:true,series:'Série 1 — Sinnoh'},
  {n:'041',name:'Chimchar',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:25.00,base:true,series:'Série 1 — Sinnoh'},
  {n:'042',name:'Piplup',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:34.00,base:true,important:true,series:'Série 1 — Sinnoh'},
  // SÉRIE 1 — Alola (MEP043–045)
  // Os três têm demanda similar; Rowlet levemente à frente
  {n:'043',name:'Rowlet',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:24.30,base:true,series:'Série 1 — Alola'},
  {n:'044',name:'Litten',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:25.00,base:true,series:'Série 1 — Alola'},
  {n:'045',name:'Popplio',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:26.90,base:true,series:'Série 1 — Alola'},
  // SÉRIE 2 — Johto (MEP046–048) — lançamento 19/06/2026, 1 semana no mercado
  // Johto = mais procurado da S2; Cyndaquil/Totodile lideram; preços ainda voláteis
  {n:'046',name:'Chikorita',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:53.70,base:true,series:'Série 2 — Johto'},
  {n:'047',name:'Cyndaquil',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:57.80,base:true,important:true,series:'Série 2 — Johto'},
  {n:'048',name:'Totodile',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:63.90,base:true,series:'Série 2 — Johto'},
  // SÉRIE 2 — Unova (MEP049–051)
  // Snivy e Oshawott têm fanbases fortes; Gen 5 em alta; Tepig menor demanda
  {n:'049',name:'Snivy',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:46.00,base:true,series:'Série 2 — Unova'},
  {n:'050',name:'Tepig',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:44.00,base:true,series:'Série 2 — Unova'},
  {n:'051',name:'Oshawott',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:44.90,base:true,series:'Série 2 — Unova'},
  // SÉRIE 2 — Galar (MEP052–054)
  // Menos nostalgia; Sobble tem maior seguimento individual; os três são os mais baratos da S2
  {n:'052',name:'Grookey',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:32.90,base:true,series:'Série 2 — Galar'},
  {n:'053',name:'Scorbunny',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:28.90,base:true,series:'Série 2 — Galar'},
  {n:'054',name:'Sobble',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:31.80,base:true,series:'Série 2 — Galar'},
  // SÉRIE 3 — Hoenn · Kalos · Paldea (MEP055–063) — confirmado via Serebii.net em 09/jul/2026,
  // preços ainda são estimativas (sem referência de venda BR no momento da inclusão)
  {n:'055',name:'Treecko',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:79.90,base:true,series:'Série 3 — Hoenn'},
  {n:'056',name:'Torchic',type:'Incolor',color:'#9E9E9E',rare:'Ilustração Rara (IR)',price:79.90,base:true,series:'Série 3 — Hoenn'},
  {n:'057',name:'Mudkip',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:79.90,base:true,important:true,series:'Série 3 — Hoenn'},
  {n:'058',name:'Chespin',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:79.90,base:true,series:'Série 3 — Kalos'},
  {n:'059',name:'Fennekin',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:79.90,base:true,important:true,series:'Série 3 — Kalos'},
  {n:'060',name:'Froakie',type:'Incolor',color:'#9E9E9E',rare:'Ilustração Rara (IR)',price:79.90,base:true,series:'Série 3 — Kalos'},
  {n:'061',name:'Sprigatito',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:79.90,base:true,important:true,series:'Série 3 — Paldea'},
  {n:'062',name:'Fuecoco',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:79.90,base:true,series:'Série 3 — Paldea'},
  {n:'063',name:'Quaxly',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:79.90,base:true,series:'Série 3 — Paldea'},
  // ── PROMOS MEP064–081 (produtos de Ordem Perfeita/ME03 e Caos Ascendente/ME04) ──
  // CORRIGIDO 13/07/2026: MEP072 (Mega Clefable ex) e MEP073 (Mega Gengar ex) JÁ estão
  // confirmados e revelados (checklist oficial serebii.net/card/megapromos) — comentário
  // antigo estava desatualizado. As duas cartas continuam nas linhas abaixo normalmente.
  // pkmncards.com ainda não tem o scan dessas duas (404 na imagem em 13/07) — o fallback
  // tcgdex também não cobre a série ME inteira (ver nota no topo do arquivo/app.js), então
  // até alguém escanear, essas duas cartas ficam sem imagem no fichário (placeholder).
  {n:'064',name:'Serperior',type:'Grama',color:'#4CAF50',rare:'Promo (Staff)',price:9.90,base:false,series:'Promos MEP 064–081'},
  {n:'065',name:'Barbaracle',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:13.50,base:false,series:'Promos MEP 064–081'},
  {n:'066',name:'Tyrantrum',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:16.50,base:false,series:'Promos MEP 064–081'},
  {n:'067',name:'Doublade',type:'Metal',color:'#9E9E9E',rare:'Promo (Staff)',price:8.90,base:false,series:'Promos MEP 064–081'},
  {n:'068',name:'Makuhita',type:'Lutador',color:'#795548',rare:'Promo',price:0.95,base:false,series:'Promos MEP 064–081'},
  {n:'069',name:'Chikorita',type:'Grama',color:'#4CAF50',rare:'Promo',price:0.75,base:false,series:'Promos MEP 064–081'},
  {n:'070',name:'Tyrunt',type:'Lutador',color:'#795548',rare:'Promo (Pokémon Center)',price:22.53,base:false,series:'Promos MEP 064–081'},
  {n:'071',name:'Mega Zygarde ex',type:'Lutador',color:'#795548',rare:'Promo (Jumbo)',price:14.25,base:false,important:true,series:'Promos MEP 064–081'},
  {n:'072',name:'Mega Clefable ex',type:'Psíquico',color:'#9C27B0',rare:'Promo (Jumbo)',price:23.75,base:false,important:true,series:'Promos MEP 064–081'},
  {n:'073',name:'Mega Gengar ex',type:'Escuridão',color:'#212121',rare:'Promo (Jumbo)',price:30.00,base:false,important:true,series:'Promos MEP 064–081'},
  {n:'074',name:'Delphox',type:'Fogo',color:'#F44336',rare:'Promo (B&B)',price:19.00,base:false,series:'Promos MEP 064–081'},
  {n:'075',name:'Ampharos',type:'Raio',color:'#FFC107',rare:'Promo (B&B)',price:12.00,base:false,series:'Promos MEP 064–081'},
  {n:'076',name:'Crobat',type:'Escuridão',color:'#212121',rare:'Promo (B&B)',price:17.70,base:false,series:'Promos MEP 064–081'},
  {n:'077',name:'Goodra',type:'Dragão',color:'#7C4DFF',rare:'Promo (B&B)',price:16.29,base:false,series:'Promos MEP 064–081'},
  {n:'078',name:'Toxel',type:'Escuridão',color:'#212121',rare:'Promo',price:0.50,base:false,series:'Promos MEP 064–081'},
  {n:'079',name:'Charmeleon',type:'Fogo',color:'#F44336',rare:'Promo',price:0.50,base:false,series:'Promos MEP 064–081'},
  {n:'080',name:'Fennekin',type:'Fogo',color:'#F44336',rare:'Promo',price:28.50,base:false,series:'Promos MEP 064–081'},
  // MEP081: existe no checklist oficial (Serebii/pkmncards) mas arte/nome ainda não revelados em 09/jul/2026 — não incluído até confirmação.
  // ── PROMOS MEP082–110 (confirmado via Serebii.net, 09/jul/2026) ──
  // MEP086–091: existem no checklist oficial mas arte/nome ainda não revelados — não incluídos até confirmação.
  {n:'082',name:'Miraidon',type:'Raio',color:'#FFC107',rare:'Promo (Jumbo)',price:29.90,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'083',name:'Slowbro',type:'Psíquico',color:'#9C27B0',rare:'Promo (B&B)',price:19.50,base:false,series:'Promos MEP 082–110'},
  {n:'084',name:'Dhelmise',type:'Psíquico',color:'#9C27B0',rare:'Promo (B&B)',price:34.00,base:false,series:'Promos MEP 082–110'},
  {n:'085',name:'Bastiodon',type:'Metal',color:'#9E9E9E',rare:'Promo (Staff)',price:22.49,base:false,series:'Promos MEP 082–110'},
  {n:'092',name:'Paradise Resort',type:'Treinador',color:'#607D8B',rare:'Promo (Estádio)',price:5.00,base:false,series:'Promos MEP 082–110'},
  {n:'093',name:'Pikachu',type:'Raio',color:'#FFC107',rare:'Promo',price:0.45,base:false,series:'Promos MEP 082–110'},
  {n:'094',name:'Alolan Exeggutor',type:'Grama',color:'#4CAF50',rare:'Promo (B&B)',price:12.00,base:false,series:'Promos MEP 082–110'},
  {n:'095',name:'Lucario',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:15.00,base:false,series:'Promos MEP 082–110'},
  {n:'096',name:'Moltres',type:'Fogo',color:'#F44336',rare:'Promo (Jumbo)',price:20.00,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'097',name:'Articuno',type:'Aquático',color:'#2196F3',rare:'Promo (Jumbo)',price:20.00,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'098',name:'Zapdos',type:'Raio',color:'#FFC107',rare:'Promo (Jumbo)',price:20.00,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'099',name:'Greninja ex',type:'Aquático',color:'#2196F3',rare:'Promo (Jumbo)',price:120.00,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'100',name:'Sylveon ex',type:'Psíquico',color:'#9C27B0',rare:'Promo (Jumbo)',price:45.00,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'101',name:'Nidorina',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.45,base:false,series:'Promos MEP 082–110'},
  {n:'102',name:'Victini',type:'Fogo',color:'#F44336',rare:'Promo (Pokémon Center)',price:20.00,base:false,series:'Promos MEP 082–110'},
  {n:'103',name:'Zeraora',type:'Raio',color:'#FFC107',rare:'Promo (Staff)',price:15.00,base:false,series:'Promos MEP 082–110'},
  {n:'104',name:'Mewtwo',type:'Psíquico',color:'#9C27B0',rare:'Promo (B&B)',price:15.00,base:false,series:'Promos MEP 082–110'},
  {n:'105',name:'Mew',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.50,base:false,series:'Promos MEP 082–110'},
  {n:'106',name:'Ditto',type:'Incolor',color:'#9E9E9E',rare:'Promo',price:0.45,base:false,series:'Promos MEP 082–110'},
  {n:'107',name:'Pikachu ex',type:'Raio',color:'#FFC107',rare:'Promo (Jumbo)',price:50.00,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'108',name:'Espeon ex',type:'Psíquico',color:'#9C27B0',rare:'Promo (Jumbo)',price:45.00,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'109',name:'Pikachu ex',type:'Raio',color:'#FFC107',rare:'Promo (Jumbo)',price:50.00,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'110',name:'Umbreon ex',type:'Escuridão',color:'#212121',rare:'Promo (Jumbo)',price:45.00,base:false,important:true,series:'Promos MEP 082–110'},
  // Snover (veio na Coleção Parceiros Iniciais junto com ME02/MEG boosters)
  {n:'140',name:'Snover',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:8.00,base:false,series:'MEG Secretas'},
];
