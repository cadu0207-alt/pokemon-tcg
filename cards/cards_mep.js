// MEP — Black Star Promos (TODAS as promocionais da série Mega Evolution, não só First Partner)
// MEP001–036: promos anteriores ao First Partner — staff/prerelease, Pokémon Center,
//   jumbo (produtos ex), stamped — confirmado via Bulbapedia (checklist oficial, jul/2026)
// Série 1: MEP037–045 (Kanto, Sinnoh, Alola) — lançamento 30/03/2026
// Série 2: MEP046–054 (Johto, Unova, Galar) — lançamento 19/06/2026 — CONFIRMADO via Serebii.net
// Série 3: MEP055–063 (Hoenn, Kalos, Paldea) — CONFIRMADO via Serebii.net (checklist), ainda sem
//   preço de mercado BR no momento da inclusão (09/jul/2026) — usar como estimativa até haver venda real
// MEP064–081: produtos de Equilíbrio Perfeito/Caos Ascendente
// Categoria: Promos exclusivos, não pertencem a nenhum set regular
// Preços: estimativas de mercado BR (jun/2026) — set completo S1 ~R$700 no MYP Cards
// NOTA sobre 001–036: preços são estimativas conservadoras por raridade/produto de origem —
// a maioria não circula no mercado BR (vieram de ETB/box/torneio, não de blister avulso).
// Ajustar quando houver referência de venda real. Fontes: bulbapedia.bulbagarden.net/wiki/MEP_Black_Star_Promos_(TCG)
//   e serebii.net/card/megapromos (checklist numerado oficial, consultado em 09/jul/2026)
//
// MEP082–110: CONFIRMADO e completo via Serebii.net (dados de carta + checklist, 09/jul/2026).
// Gap confirmado (arte ainda não revelada, não incluído): #89–91.
// #81 (Mega Greninja ex) e #86-88 (Slowpoke/Binacle/Zarude) foram adicionados
// em 29/07/2026 após conferência completa — não eram mais gaps.
// #94–106: NÃO CONFIRMADOS nas fontes públicas consultadas (Bulbapedia/Serebii/
// Pokellector/TCDB não trazem esses 13 números) — manter, mas reavaliar se
// aparecer fonte primária. #107-110 (dois "Pikachu ex") são duplicata OFICIAL,
// não erro — confirmado no checklist.
// Checklist oficial do Serebii vai de #1 até #110 — catálogo MEP 100% completo neste arquivo.
const CARDS_MEP = [
  // ── PROMOS MEP001–036 (produtos diversos, set/torneio da série Mega Evolution) ──
  {n:'001',artist:"Uninori",name:'Meganium',type:'Grama',color:'#4CAF50',rare:'Promo (Staff)',price:39.67,base:false,series:'Promos MEP 001–036'},
  {n:'002',artist:"Kazumasa Yasukuni",name:'Inteleon',type:'Aquático',color:'#2196F3',rare:'Promo (Staff)',price:9.90,base:false,series:'Promos MEP 001–036'},
  {n:'003',artist:"cochi8i",name:'Alakazam',type:'Psíquico',color:'#9C27B0',rare:'Promo (Staff)',price:37.70,base:false,series:'Promos MEP 001–036'},
  {n:'004',artist:"Ounishi",name:'Lunatone',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:23.67,base:false,series:'Promos MEP 001–036'},
  {n:'005',artist:"Shimaris Yukichi",name:'Drifloon',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.45,base:false,series:'Promos MEP 001–036'},
  {n:'006',artist:"Shimaris Yukichi",name:'Drifblim',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.45,base:false,series:'Promos MEP 001–036'},
  {n:'007',artist:"Jiro Sasumo",name:'Psyduck',type:'Aquático',color:'#2196F3',rare:'Promo',price:1.00,base:false,series:'Promos MEP 001–036'},
  {n:'008',artist:"Jiro Sasumo",name:'Golduck',type:'Aquático',color:'#2196F3',rare:'Promo',price:0.75,base:false,series:'Promos MEP 001–036'},
  {n:'009',artist:"Aya Kusube",name:'Alakazam',type:'Psíquico',color:'#9C27B0',rare:'Promo (Pokémon Center)',price:118.66,base:false,series:'Promos MEP 001–036'},
  {n:'010',artist:"GOSSAN",name:'Riolu',type:'Lutador',color:'#795548',rare:'Promo (Pokémon Center)',price:92.90,base:false,series:'Promos MEP 001–036'},
  {n:'011',artist:"5ban Graphics",name:'Mega Latias ex',type:'Dragão',color:'#7C4DFF',rare:'Promo (Jumbo)',price:4.99,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'012',artist:"5ban Graphics",name:'Mega Lucario ex',type:'Lutador',color:'#795548',rare:'Promo (Jumbo)',price:6.99,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'013',artist:"5ban Graphics",name:'Mega Venusaur ex',type:'Grama',color:'#4CAF50',rare:'Promo (Jumbo)',price:5.95,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'014',artist:"Anesaki Dynamic",name:'Ceruledge',type:'Fogo',color:'#F44336',rare:'Promo (Staff)',price:16.00,base:false,series:'Promos MEP 001–036'},
  {n:'015',artist:"Shiburingaru",name:'Zacian',type:'Psíquico',color:'#9C27B0',rare:'Promo (Staff)',price:9.80,base:false,series:'Promos MEP 001–036'},
  {n:'016',artist:"Oswaldo KATO",name:'Flygon',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:11.90,base:false,series:'Promos MEP 001–036'},
  {n:'017',artist:"Krgc",name:'Toxtricity',type:'Escuridão',color:'#212121',rare:'Promo (Staff)',price:12.90,base:false,series:'Promos MEP 001–036'},
  {n:'018',artist:"Kariya",name:'Cottonee',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.29,base:false,series:'Promos MEP 001–036'},
  {n:'019',artist:"Yuka Tanaka",name:'Whimsicott',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:0.25,base:false,series:'Promos MEP 001–036'},
  {n:'020',artist:"Souichirou Gunjima",name:'Sneasel',type:'Escuridão',color:'#212121',rare:'Promo',price:0.25,base:false,series:'Promos MEP 001–036'},
  {n:'021',artist:"matazo",name:'Weavile',type:'Escuridão',color:'#212121',rare:'Promo',price:0.25,base:false,series:'Promos MEP 001–036'},
  {n:'022',artist:"Teeziro",name:'Charcadet',type:'Fogo',color:'#F44336',rare:'Promo (Pokémon Center)',price:20.99,base:false,series:'Promos MEP 001–036'},
  {n:'023',artist:"Saboteri",name:'Mega Charizard X ex',type:'Fogo',color:'#F44336',rare:'Promo (UPC)',price:80.00,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'024',artist:"Shinji Kanda",name:'Oricorio ex',type:'Fogo',color:'#F44336',rare:'Promo (UPC)',price:18.00,base:false,series:'Promos MEP 001–036'},
  {n:'025',artist:"5ban Graphics",name:'Mega Kangaskhan ex',type:'Incolor',color:'#9E9E9E',rare:'Promo (Jumbo)',price:14.58,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'026',artist:"Keisin",name:'Meloetta',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:33.16,base:false,series:'Promos MEP 001–036'},
  {n:'027',artist:"Arai Kiriko",name:'Haunter',type:'Escuridão',color:'#212121',rare:'Promo',price:99.00,base:false,series:'Promos MEP 001–036'},
  {n:'028',artist:"Yuu Nishida",name:'Celebratory Fanfare',type:'Treinador',color:'#607D8B',rare:'Promo (Stamped)',price:100.00,base:false,series:'Promos MEP 001–036'},
  {n:'029',artist:"takuyoa",name:'Mega Charizard X ex',type:'Fogo',color:'#F44336',rare:'Promo (Tin)',price:19.00,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'030',artist:"Ultimateinudog",name:'Mega Charizard Y ex',type:'Fogo',color:'#F44336',rare:'Promo (Tin)',price:23.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'031',artist:"Bun Toujo",name:"N's Zekrom",type:'Raio',color:'#FFC107',rare:'Promo (Pokémon Center)',price:52.90,base:false,series:'Promos MEP 001–036'},
  {n:'032',artist:"Saboteri",name:'Mega Gardevoir ex',type:'Psíquico',color:'#9C27B0',rare:'Promo (Poster)',price:38.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'033',artist:"5ban Graphics",name:'Mega Lucario ex',type:'Lutador',color:'#795548',rare:'Promo (Poster)',price:68.99,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'034',artist:"5ban Graphics",name:'Mega Meganium ex',type:'Grama',color:'#4CAF50',rare:'Promo (Jumbo)',price:4.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'035',artist:"5ban Graphics",name:'Mega Emboar ex',type:'Fogo',color:'#F44336',rare:'Promo (Jumbo)',price:3.90,base:false,important:true,series:'Promos MEP 001–036'},
  {n:'036',artist:"5ban Graphics",name:'Mega Feraligatr ex',type:'Aquático',color:'#2196F3',rare:'Promo (Jumbo)',price:6.40,base:false,important:true,series:'Promos MEP 001–036'},
  // SÉRIE 1 — Kanto (MEP037–039)
  // Charmander > Bulbasaur > Squirtle em popularidade; referência USD: ~$44/$37/$34
  {n:'037',artist:"Saboteri",name:'Bulbasaur',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:79.90,base:true,important:true,series:'Série 1 — Kanto'},
  {n:'038',artist:"Saboteri",name:'Charmander',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:103.46,base:true,important:true,series:'Série 1 — Kanto'},
  {n:'039',artist:"Saboteri",name:'Squirtle',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:71.16,base:true,important:true,series:'Série 1 — Kanto'},
  // SÉRIE 1 — Sinnoh (MEP040–042)
  // Piplup > Chimchar > Turtwig; Piplup tem maior fanbase
  {n:'040',artist:"Saboteri",name:'Turtwig',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:20.00,base:true,series:'Série 1 — Sinnoh'},
  {n:'041',artist:"Saboteri",name:'Chimchar',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:23.75,base:true,series:'Série 1 — Sinnoh'},
  {n:'042',artist:"Saboteri",name:'Piplup',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:24.70,base:true,important:true,series:'Série 1 — Sinnoh'},
  // SÉRIE 1 — Alola (MEP043–045)
  // Os três têm demanda similar; Rowlet levemente à frente
  {n:'043',artist:"Saboteri",name:'Rowlet',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:22.50,base:true,series:'Série 1 — Alola'},
  {n:'044',artist:"Saboteri",name:'Litten',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:23.40,base:true,series:'Série 1 — Alola'},
  {n:'045',artist:"Saboteri",name:'Popplio',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:20.00,base:true,series:'Série 1 — Alola'},
  // SÉRIE 2 — Johto (MEP046–048) — lançamento 19/06/2026, 1 semana no mercado
  // Johto = mais procurado da S2; Cyndaquil/Totodile lideram; preços ainda voláteis
  {n:'046',artist:"Saboteri",name:'Chikorita',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:49.89,base:true,series:'Série 2 — Johto'},
  {n:'047',artist:"Saboteri",name:'Cyndaquil',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:46.00,base:true,important:true,series:'Série 2 — Johto'},
  {n:'048',artist:"Saboteri",name:'Totodile',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:55.00,base:true,series:'Série 2 — Johto'},
  // SÉRIE 2 — Unova (MEP049–051)
  // Snivy e Oshawott têm fanbases fortes; Gen 5 em alta; Tepig menor demanda
  {n:'049',artist:"Saboteri",name:'Snivy',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:24.89,base:true,series:'Série 2 — Unova'},
  {n:'050',artist:"Saboteri",name:'Tepig',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:26.90,base:true,series:'Série 2 — Unova'},
  {n:'051',artist:"Saboteri",name:'Oshawott',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:29.00,base:true,series:'Série 2 — Unova'},
  // SÉRIE 2 — Galar (MEP052–054)
  // Menos nostalgia; Sobble tem maior seguimento individual; os três são os mais baratos da S2
  {n:'052',artist:"Saboteri",name:'Grookey',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:20.00,base:true,series:'Série 2 — Galar'},
  {n:'053',artist:"Saboteri",name:'Scorbunny',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:24.50,base:true,series:'Série 2 — Galar'},
  {n:'054',artist:"Saboteri",name:'Sobble',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:22.90,base:true,series:'Série 2 — Galar'},
  // SÉRIE 3 — Hoenn · Kalos · Paldea (MEP055–063) — confirmado via Serebii.net em 09/jul/2026,
  // preços ainda são estimativas (sem referência de venda BR no momento da inclusão)
  {n:'055',artist:"Saboteri",name:'Treecko',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:31.44,base:true,series:'Série 3 — Hoenn'},
  {n:'056',artist:"Saboteri",name:'Torchic',type:'Incolor',color:'#9E9E9E',rare:'Ilustração Rara (IR)',price:28.90,base:true,series:'Série 3 — Hoenn'},
  {n:'057',artist:"Saboteri",name:'Mudkip',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:31.40,base:true,important:true,series:'Série 3 — Hoenn'},
  {n:'058',artist:"Saboteri",name:'Chespin',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:22.67,base:true,series:'Série 3 — Kalos'},
  {n:'059',artist:"Saboteri",name:'Fennekin',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:22.67,base:true,important:true,series:'Série 3 — Kalos'},
  {n:'060',artist:"Saboteri",name:'Froakie',type:'Incolor',color:'#9E9E9E',rare:'Ilustração Rara (IR)',price:25.49,base:true,series:'Série 3 — Kalos'},
  {n:'061',artist:"Saboteri",name:'Sprigatito',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:25.48,base:true,important:true,series:'Série 3 — Paldea'},
  {n:'062',artist:"Saboteri",name:'Fuecoco',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:20.00,base:true,series:'Série 3 — Paldea'},
  {n:'063',artist:"Saboteri",name:'Quaxly',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:22.60,base:true,series:'Série 3 — Paldea'},
  // ── PROMOS MEP064–081 (produtos de Equilíbrio Perfeito/ME03 e Caos Ascendente/ME04) ──
  // CORRIGIDO 13/07/2026: MEP072 (Mega Clefable ex) e MEP073 (Mega Gengar ex) JÁ estão
  // confirmados e revelados (checklist oficial serebii.net/card/megapromos) — comentário
  // antigo estava desatualizado. As duas cartas continuam nas linhas abaixo normalmente.
  // pkmncards.com ainda não tem o scan dessas duas (404 na imagem em 13/07) — o fallback
  // tcgdex também não cobre a série ME inteira (ver nota no topo do arquivo/app.js), então
  // até alguém escanear, essas duas cartas ficam sem imagem no fichário (placeholder).
  {n:'064',artist:"LINNE",name:'Serperior',type:'Grama',color:'#4CAF50',rare:'Promo (Staff)',price:8.99,base:false,series:'Promos MEP 064–081'},
  {n:'065',artist:"Hasuno",name:'Barbaracle',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:11.49,base:false,series:'Promos MEP 064–081'},
  {n:'066',artist:"Nisota Niso",name:'Tyrantrum',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:9.50,base:false,series:'Promos MEP 064–081'},
  {n:'067',artist:"Yukihiro Tada",name:'Doublade',type:'Metal',color:'#9E9E9E',rare:'Promo (Staff)',price:8.90,base:false,series:'Promos MEP 064–081'},
  {n:'068',artist:"Takeshi Nakamura",name:'Makuhita',type:'Lutador',color:'#795548',rare:'Promo',price:0.25,base:false,series:'Promos MEP 064–081'},
  {n:'069',artist:"Makura Tami",name:'Chikorita',type:'Grama',color:'#4CAF50',rare:'Promo',price:0.75,base:false,series:'Promos MEP 064–081'},
  {n:'070',artist:"Shimaris Yukichi",name:'Tyrunt',type:'Lutador',color:'#795548',rare:'Promo (Pokémon Center)',price:13.00,base:false,series:'Promos MEP 064–081'},
  {n:'071',artist:"takuyoa",name:'Mega Zygarde ex',type:'Lutador',color:'#795548',rare:'Promo (Jumbo)',price:7.32,base:false,important:true,series:'Promos MEP 064–081'},
  {n:'072',artist:"aky CG Works",name:'Mega Clefable ex',type:'Psíquico',color:'#9C27B0',rare:'Promo (Jumbo)',price:8.99,base:false,important:true,series:'Promos MEP 064–081'},
  {n:'073',artist:"Ultimateinudog",name:'Mega Gengar ex',type:'Escuridão',color:'#212121',rare:'Promo (Jumbo)',price:23.90,base:false,important:true,series:'Promos MEP 064–081'},
  {n:'074',artist:"Souichirou Gunjima",name:'Delphox',type:'Fogo',color:'#F44336',rare:'Promo (B&B)',price:10.67,base:false,series:'Promos MEP 064–081'},
  {n:'075',artist:"Taiga Kasai",name:'Ampharos',type:'Raio',color:'#FFC107',rare:'Promo (B&B)',price:13.90,base:false,series:'Promos MEP 064–081'},
  {n:'076',artist:"Apios",name:'Crobat',type:'Escuridão',color:'#212121',rare:'Promo (B&B)',price:11.95,base:false,series:'Promos MEP 064–081'},
  {n:'077',artist:"okayamatakatoshi",name:'Goodra',type:'Dragão',color:'#7C4DFF',rare:'Promo (B&B)',price:9.90,base:false,series:'Promos MEP 064–081'},
  {n:'078',artist:"Mina Nakai",name:'Toxel',type:'Escuridão',color:'#212121',rare:'Promo',price:0.25,base:false,series:'Promos MEP 064–081'},
  {n:'079',artist:"Teeziro",name:'Charmeleon',type:'Fogo',color:'#F44336',rare:'Promo',price:0.49,base:false,series:'Promos MEP 064–081'},
  {n:'080',artist:"satoma",name:'Fennekin',type:'Fogo',color:'#F44336',rare:'Promo',price:19.90,base:false,series:'Promos MEP 064–081'},
  // CORRIGIDO 29/07/2026 (Eduardo tem a carta física): #81 estava faltando —
  // comentário do arquivo dizia "arte ainda não revelada", mas a carta já foi
  // lançada na Mega Greninja ex Premium Collection (~03/jul/2026). Confirmado
  // via PriceCharting/CardTrader/TCG Collector: holo "Double Rare", tipo Água.
  {n:'081',artist:"5ban Graphics",name:'Mega Greninja ex',type:'Aquático',color:'#2196F3',rare:'Promo (Jumbo)',price:16.90,base:false,important:true,series:'Promos MEP 064–081'},
  // ── PROMOS MEP082–110 (confirmado via Serebii.net, 09/jul/2026) ──
  // MEP089–091: existem no checklist oficial mas arte/nome ainda não revelados — não incluídos até confirmação.
  {n:'082',artist:"Taira Akitsu",name:'Miraidon',type:'Raio',color:'#FFC107',rare:'Promo (Jumbo)',price:7.67,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'083',artist:"Yuriko Akase",name:'Slowbro',type:'Psíquico',color:'#9C27B0',rare:'Promo (B&B)',price:14.70,base:false,series:'Promos MEP 082–110'},
  {n:'084',artist:"Dsuke",name:'Dhelmise',type:'Psíquico',color:'#9C27B0',rare:'Promo (B&B)',price:24.40,base:false,series:'Promos MEP 082–110'},
  {n:'085',artist:"Minahamu",name:'Bastiodon',type:'Metal',color:'#9E9E9E',rare:'Promo (Staff)',price:11.40,base:false,series:'Promos MEP 082–110'},
  // CORRIGIDO 29/07/2026 (conferência completa pedida pelo Eduardo): #86-88
  // estavam marcados como "gap sem arte revelada", mas as 3 já foram lançadas
  // (Pitch Black blisters/ETB, 17/07/2026). Confirmado via Bulbapedia/Serebii/
  // Pokellector. Só #89-91 continuam sem arte revelada de fato.
  {n:'086',artist:"miki kudo",name:'Slowpoke',type:'Psíquico',color:'#9C27B0',rare:'Promo (Blister)',price:0.30,base:false,series:'Promos MEP 082–110'},
  {n:'087',artist:"Shimaris Yukichi",name:'Binacle',type:'Lutador',color:'#795548',rare:'Promo (Blister)',price:0.32,base:false,series:'Promos MEP 082–110'},
  {n:'088',artist:"IKEDA Saki",name:'Zarude',type:'Escuridão',color:'#212121',rare:'Promo (Pokémon Center)',price:7.90,base:false,series:'Promos MEP 082–110'},
  // 19/11/2026: #89-91 já têm arte (Limitless/TCGCSV) — preço BRL estimado = US$ × 5,50
  {n:'089',artist:"5ban Graphics",name:'Mega Zeraora ex',type:'Raio',color:'#FFC107',rare:'Promo',price:14.80,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'090',artist:"5ban Graphics",name:'Mega Darkrai ex',type:'Escuridão',color:'#212121',rare:'Promo',price:14.90,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'091',artist:"5ban Graphics",name:'Mega Dragonite ex',type:'Dragão',color:'#7C4DFF',rare:'Promo',price:31.90,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'092',artist:"Naoki Saito",name:'Paradise Resort',type:'Treinador',color:'#607D8B',rare:'Promo (Estádio)',price:1099.00,base:false,series:'Promos MEP 082–110'},
  {n:'093',artist:"DOM",name:'Pikachu',type:'Raio',color:'#FFC107',rare:'Promo',price:65.50,base:false,series:'Promos MEP 082–110'},
  {n:'094',artist:"yuu",name:'Alolan Exeggutor',type:'Grama',color:'#4CAF50',rare:'Promo (B&B)',price:0.40,base:false,series:'Promos MEP 082–110'},
  {n:'095',artist:"Taiga Kasai",name:'Lucario',type:'Lutador',color:'#795548',rare:'Promo (Staff)',price:0.35,base:false,series:'Promos MEP 082–110'},
  {n:'096',artist:"Krgc",name:'Moltres',type:'Fogo',color:'#F44336',rare:'Promo (Jumbo)',price:1.97,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'097',artist:"Taira Akitsu",name:'Articuno',type:'Aquático',color:'#2196F3',rare:'Promo (Jumbo)',price:1.97,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'098',artist:"SIE NANAHARA",name:'Zapdos',type:'Raio',color:'#FFC107',rare:'Promo (Jumbo)',price:1.97,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'099',artist:"5ban Graphics",name:'Greninja ex',type:'Aquático',color:'#2196F3',rare:'Promo (Jumbo)',price:7.49,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'100',artist:"5ban Graphics",name:'Sylveon ex',type:'Psíquico',color:'#9C27B0',rare:'Promo (Jumbo)',price:9.98,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'101',artist:"Taiga Kasai",name:'Nidorina',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:16.90,base:false,series:'Promos MEP 082–110'},
  {n:'102',artist:"satoma",name:'Victini',type:'Fogo',color:'#F44336',rare:'Promo (Pokémon Center)',price:53.91,base:false,series:'Promos MEP 082–110'},
  {n:'103',artist:"HACCAN",name:'Zeraora',type:'Raio',color:'#FFC107',rare:'Promo (Staff)',price:53.91,base:false,series:'Promos MEP 082–110'},
  {n:'104',artist:"Nisota Niso",name:'Mewtwo',type:'Psíquico',color:'#9C27B0',rare:'Promo (B&B)',price:37.30,base:false,series:'Promos MEP 082–110'},
  {n:'105',artist:"Cona Nitanda",name:'Mew',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:53.91,base:false,series:'Promos MEP 082–110'},
  {n:'106',artist:"Ounishi",name:'Ditto',type:'Incolor',color:'#9E9E9E',rare:'Promo',price:55.00,base:false,series:'Promos MEP 082–110'},
  {n:'107',artist:"YOSHIROTTEN",name:'Pikachu ex',type:'Raio',color:'#FFC107',rare:'Promo (Jumbo)',price:368.50,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'108',artist:"REND",name:'Espeon ex',type:'Psíquico',color:'#9C27B0',rare:'Promo (Jumbo)',price:364.90,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'109',artist:"YOSHIROTTEN",name:'Pikachu ex',type:'Raio',color:'#FFC107',rare:'Promo (Jumbo)',price:379.90,base:false,important:true,series:'Promos MEP 082–110'},
  {n:'110',artist:"REND",name:'Umbreon ex',type:'Escuridão',color:'#212121',rare:'Promo (Jumbo)',price:479.90,base:false,important:true,series:'Promos MEP 082–110'},
  // MEP111–120 — promos da era Reinado Delta (ME06), pedido do André 19/11/2026.
  // Lista e artistas conferidos na Limitless; preço BRL estimado = US$ (TCGCSV, Holofoil) × 5,50.
  // #118–119 ainda não existem na Limitless; #120 sem preço de mercado (estimativa).
  {n:'111',name:'Masquerain',type:'Grama',color:'#4CAF50',rare:'Promo',price:17.90,base:false,series:'Promos MEP 111–120'},
  {n:'112',name:'Magmortar',type:'Fogo',color:'#F44336',rare:'Promo',price:19.99,base:false,series:'Promos MEP 111–120'},
  {n:'113',name:'Enamorus',type:'Psíquico',color:'#9C27B0',rare:'Promo',price:15.00,base:false,series:'Promos MEP 111–120'},
  {n:'114',name:'Kommo-o',type:'Dragão',color:'#7C4DFF',rare:'Promo',price:16.99,base:false,series:'Promos MEP 111–120'},
  {n:'115',name:'Spritzee',type:'Psíquico',color:'#9C27B0',rare:'Promo (Blister)',price:0.50,base:false,series:'Promos MEP 111–120'},
  {n:'116',name:'Seel',type:'Aquático',color:'#2196F3',rare:'Promo (Blister)',price:0.60,base:false,series:'Promos MEP 111–120'},
  {n:'117',name:'Kyogre',type:'Aquático',color:'#2196F3',rare:'Promo',price:62.89,base:false,series:'Promos MEP 111–120'},
  {n:'120',artist:"Yuu Nishida",name:'Celebratory Fanfare',type:'Treinador',color:'#607D8B',rare:'Promo (Estádio)',price:3.00,base:false,series:'Promos MEP 111–120'},
  // Snover (veio na Coleção Parceiros Iniciais junto com ME02/MEG boosters)
  {n:'140',name:'Snover',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:8.00,base:false,series:'MEG Secretas'},
];
