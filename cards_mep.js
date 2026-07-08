// MEP — Black Star Promos (TODAS as promocionais da série Mega Evolution, não só First Partner)
// MEP001–036: promos anteriores ao First Partner — staff/prerelease, Pokémon Center,
//   jumbo (produtos ex), stamped — confirmado via Bulbapedia (checklist oficial, jul/2026)
// Série 1: MEP037–MEP045 (Kanto, Sinnoh, Alola) — lançamento 30/03/2026
// Série 2: MEP046–MEP054 (Johto, Unova, Galar)  — lançamento 19/06/2026
// Série 3: MEP055–063 (Hoenn/Kalos/Paldea) — lança 07/ago/2026, artes ainda não reveladas (não incluído)
// Categoria: Promos exclusivos, não pertencem a nenhum set regular
// Preços: estimativas de mercado BR (jun/2026) — set completo S1 ~R$700 no MYP Cards
// NOTA sobre 001–036: preços são estimativas conservadoras por raridade/produto de origem —
// a maioria não circula no mercado BR (vieram de ETB/box/torneio, não de blister avulso).
// Ajustar quando houver referência de venda real. Fonte da lista: bulbapedia.bulbagarden.net/wiki/MEP_Black_Star_Promos_(TCG)
const CARDS_MEP = [
  // ── PROMOS MEP001–036 (produtos diversos, set/torneio da série Mega Evolution) ──
  {n:'001',name:'Meganium',type:'Grama',color:'#4CAF50',rare:'Promo (Staff)',price:19.90,base:false,series:'Promos MEP 001–036'},
  {n:'002',name:'Inteleon',type:'Aquático',color:'#2196F3',rare:'Promo (Staff)',price:7.75,base:false,series:'Promos MEP 001–036'},
  {n:'003',name:'Alakazam',type:'Psíquico',color:'#9C27B0',rare:'Promo (Staff)',price:42.00,base:false,series:'Promos MEP 001–036'},
  {n:'004',name:'Lunatone',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:37.99,base:false,series:'Promos MEP 001–036'},
  {n:'005',name:'Drifloon',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.45,base:false,series:'Promos MEP 001–036'},
  {n:'006',name:'Drifblim',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.34,base:false,series:'Promos MEP 001–036'},
  {n:'007',name:'Psyduck',type:'Aquático',color:'#2196F3',rare:'Promo',price:1.50,base:false,series:'Promos MEP 001–036'},
  {n:'008',name:'Golduck',type:'Aquático',color:'#2196F3',rare:'Promo',price:0.89,base:false,series:'Promos MEP 001–036'},
  {n:'009',name:'Alakazam',type:'Psíquico',color:'#9C27B0',rare:'Promo (Pokémon Center)',price:124.90,base:false,series:'Promos MEP 001–036'},
  {n:'010',name:'Riolu',type:'Lutador',color:'#795548',rare:'Promo (Pokémon Center)',price:104.90,base:false,series:'Promos MEP 001–036'},
  {n:'011',name:'Mega Latias ex',type:'Dragão',color:'#7C4DFF',rare:'Promo (Jumbo)',price:5.49,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'012',name:'Mega Lucario ex',type:'Lutador',color:'#795548',rare:'Promo (Jumbo)',price:9.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'013',name:'Mega Venusaur ex',type:'Grama',color:'#4CAF50',rare:'Promo (Jumbo)',price:6.29,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'014',name:'Ceruledge',type:'Fogo',color:'#F44336',rare:'Promo (Staff)',price:15.00,base:false,series:'Promos MEP 001–036'},
  {n:'015',name:'Zacian',type:'Psíquico',color:'#9C27B0',rare:'Promo (Staff)',price:9.25,base:false,series:'Promos MEP 001–036'},
  {n:'016',name:'Flygon',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:11.90,base:false,series:'Promos MEP 001–036'},
  {n:'017',name:'Toxtricity',type:'Escuridão',color:'#212121',rare:'Promo (Staff)',price:17.50,base:false,series:'Promos MEP 001–036'},
  {n:'018',name:'Cottonee',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.43,base:false,series:'Promos MEP 001–036'},
  {n:'019',name:'Whimsicott',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.50,base:false,series:'Promos MEP 001–036'},
  {n:'020',name:'Sneasel',type:'Escuridão',color:'#212121',rare:'Promo',price:0.44,base:false,series:'Promos MEP 001–036'},
  {n:'021',name:'Weavile',type:'Escuridão',color:'#212121',rare:'Promo',price:0.45,base:false,series:'Promos MEP 001–036'},
  {n:'022',name:'Charcadet',type:'Fogo',color:'#F44336',rare:'Promo (Pokémon Center)',price:20.99,base:false,series:'Promos MEP 001–036'},
  {n:'023',name:'Mega Charizard X ex',type:'Fogo',color:'#F44336',rare:'Promo (UPC)',price:100.00,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'024',name:'Oricorio ex',type:'Fogo',color:'#F44336',rare:'Promo (UPC)',price:29.79,base:false,series:'Promos MEP 001–036'},
  {n:'025',name:'Mega Kangaskhan ex',type:'Incolor',color:'#9E9E9E',rare:'Promo (Jumbo)',price:9.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'026',name:'Meloetta',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:24.75,base:false,series:'Promos MEP 001–036'},
  {n:'027',name:'Haunter',type:'Escuridão',color:'#212121',rare:'Promo',price:64.90,base:false,series:'Promos MEP 001–036'},
  {n:'028',name:'Celebratory Fanfare',type:'Treinador',color:'#607D8B',rare:'Promo (Stamped)',price:100.00,base:false,series:'Promos MEP 001–036'},
  {n:'029',name:'Mega Charizard X ex',type:'Fogo',color:'#F44336',rare:'Promo (Tin)',price:23.75,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'030',name:'Mega Charizard Y ex',type:'Fogo',color:'#F44336',rare:'Promo (Tin)',price:21.00,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'031',name:"N's Zekrom",type:'Raio',color:'#FFC107',rare:'Promo (Pokémon Center)',price:49.34,base:false,series:'Promos MEP 001–036'},
  {n:'032',name:'Mega Gardevoir ex',type:'Psíquico',color:'#9C27B0',rare:'Promo (Poster)',price:31.50,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'033',name:'Mega Lucario ex',type:'Lutador',color:'#795548',rare:'Promo (Poster)',price:49.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'034',name:'Mega Meganium ex',type:'Grama',color:'#4CAF50',rare:'Promo (Jumbo)',price:11.95,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'035',name:'Mega Emboar ex',type:'Fogo',color:'#F44336',rare:'Promo (Jumbo)',price:9.98,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'036',name:'Mega Feraligatr ex',type:'Aquático',color:'#2196F3',rare:'Promo (Jumbo)',price:9.21,base:false,important:true,series:'Promos MEP 001–036'},
  // SÉRIE 1 — Kanto (MEP037–039)
  // Charmander > Bulbasaur > Squirtle em popularidade; referência USD: ~$44/$37/$34
  {n:'037',name:'Bulbasaur',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:55.25,base:true,important:true,series:'Série 1 — Kanto'},
  {n:'038',name:'Charmander',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:94.00,base:true,important:true,series:'Série 1 — Kanto'},
  {n:'039',name:'Squirtle',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:66.90,base:true,important:true,series:'Série 1 — Kanto'},
  // SÉRIE 1 — Sinnoh (MEP040–042)
  // Piplup > Chimchar > Turtwig; Piplup tem maior fanbase
  {n:'040',name:'Turtwig',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:29.99,base:true,series:'Série 1 — Sinnoh'},
  {n:'041',name:'Chimchar',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:25.00,base:true,series:'Série 1 — Sinnoh'},
  {n:'042',name:'Piplup',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:34.90,base:true,important:true,series:'Série 1 — Sinnoh'},
  // SÉRIE 1 — Alola (MEP043–045)
  // Os três têm demanda similar; Rowlet levemente à frente
  {n:'043',name:'Rowlet',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:24.99,base:true,series:'Série 1 — Alola'},
  {n:'044',name:'Litten',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:28.00,base:true,series:'Série 1 — Alola'},
  {n:'045',name:'Popplio',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:26.00,base:true,series:'Série 1 — Alola'},
  // SÉRIE 2 — Johto (MEP046–048) — lançamento 19/06/2026, 1 semana no mercado
  // Johto = mais procurado da S2; Cyndaquil/Totodile lideram; preços ainda voláteis
  {n:'046',name:'Chikorita',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:59.88,base:true,series:'Série 2 — Johto'},
  {n:'047',name:'Cyndaquil',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:60.00,base:true,important:true,series:'Série 2 — Johto'},
  {n:'048',name:'Totodile',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:60.00,base:true,series:'Série 2 — Johto'},
  // SÉRIE 2 — Unova (MEP049–051)
  // Snivy e Oshawott têm fanbases fortes; Gen 5 em alta; Tepig menor demanda
  {n:'049',name:'Snivy',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:41.90,base:true,series:'Série 2 — Unova'},
  {n:'050',name:'Tepig',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:49.80,base:true,series:'Série 2 — Unova'},
  {n:'051',name:'Oshawott',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:44.50,base:true,series:'Série 2 — Unova'},
  // SÉRIE 2 — Galar (MEP052–054)
  // Menos nostalgia; Sobble tem maior seguimento individual; os três são os mais baratos da S2
  {n:'052',name:'Grookey',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:35.00,base:true,series:'Série 2 — Galar'},
  {n:'053',name:'Scorbunny',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:35.00,base:true,series:'Série 2 — Galar'},
  {n:'054',name:'Sobble',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:31.49,base:true,series:'Série 2 — Galar'},
  // Snover (veio na Coleção Parceiros Iniciais junto com ME02/MEG boosters)
  {n:'140',name:'Snover',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:8.00,base:false,series:'MEG Secretas'},
];
