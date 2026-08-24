// ME05 — Escuridão Absoluta (Abyss Eye / M5) — 120 cartas
// Lancamento Japao: 22 mai 2026 | Lancamento BR (Copag): 17 jul 2026 | Pre-lancamento: 4-12 jul 2026
// Tema: Mega Darkrai ex, Mega Zeraora ex, Mega Chandelure ex, Mega Excadrill ex,
//       Mega Delphox ex, Mega Slowbro ex
// Fonte: deckcerto.com (galeria completa + ranking top 20 mais caras, precos em USD, mercado internacional)
// NOTA: Precos de cartas fora do top 20 sao estimativas por raridade — ajustar quando o mercado BR abrir.
//
// CORRIGIDO 24/07/2026: o arquivo tinha só 118 cartas — faltavam Mega Delphox ex
// (posição oficial #8) e Mega Slowbro ex (#31) inteiras, e o suporte Jett (#79).
// Isso empurrava toda carta a partir da #8 uma casa pra frente (ex: o print real
// da Sizzlipede, #9, aparecia rotulado "Centiskorch" na tela — reportado pelo
// Eduardo com print do modal). Nas secretas sobrava um Zarude duplicado (posição
// antiga #090) que não existe na lista oficial de Art Rare do set. Conferido
// contra pokellector.com/Pitch-Black-Expansion (120 cartas: 84 base + 36
// secretas) — inseridas as 3 que faltavam, removida a duplicata, e renumerado
// tudo pra bater com a numeração oficial (que é a mesma usada pelo scrydex CDN
// em imgMe05() no app.js, então a imagem certa volta a casar com o nome certo).
// Também corrigido o campo `dex`: estava "atrasado" em 1 posição a partir da
// carta 008 (cada linha carregava o dex REAL da carta anterior) — usado pelo
// Master Set Nacional pra agrupar por espécie, então o erro também deixava
// cartas no slot errado da Pokédex lá. Ver [[project_pokemon_tcg]].
const CARDS_ME05 = [
  // ── SET BASE 001–084 ─────────────────────────────────────
  // CORRIGIDO 18/07/2026: as 8 cartas "ex" da base (004,015,026,036,043,046,
  // 053,063) estavam com rare:'Rara' (mesmo texto de Rare Holo comum), o que faz
  // getSlots() (app.js) cair no ramo [F,RH] — 2 versões colecionáveis. Na vida
  // real "ex" é raridade Double Rare (Rara Dupla), impressão única, sem reverse
  // holo (confirmado contra limitlesstcg.com/cards/PBL/4 — Lurantis ex é só
  // "Double Rare", 1 print). Trocado pra rare:'Rara Dupla', que já cai no ramo
  // [F] (1 versão) — mesmo padrão usado em cards_me02/03/04.js e cards_meg.js
  // pras cartas ex deles. Isso pedia 8 versões fantasma a mais no master set.
  // Ver [[project_pokemon_tcg]].
  {n:'001',dex:357,artist:'Akino Fukuji',name:'Tropius',type:'Grama',color:'#4CAF50',rare:'Comum',price:0.10,base:true},
  {n:'002',dex:736,artist:'Mina Nakai',name:'Grubbin',type:'Grama',color:'#4CAF50',rare:'Comum',price:0.10,base:true},
  {n:'003',dex:753,artist:'nisimono',name:'Fomantis',type:'Grama',color:'#4CAF50',rare:'Comum',price:0.10,base:true},
  {n:'004',dex:754,artist:'5ban Graphics',name:'Lurantis ex',type:'Grama',color:'#4CAF50',rare:'Rara Dupla',price:2.43,base:true},
  {n:'005',dex:1012,artist:'Mousho',name:'Poltchageist',type:'Trevas',color:'#212121',rare:'Comum',price:0.14,base:true},
  {n:'006',dex:1013,artist:'mingo',name:'Sinistcha',type:'Trevas',color:'#212121',rare:'Incomum',price:0.20,base:true},
  {n:'007',dex:485,artist:'Takeshi Nakamura',name:'Heatran',type:'Fogo',color:'#F44336',rare:'Incomum',price:0.10,base:true},
  {n:'008',dex:655,name:'Mega Delphox ex',type:'Fogo',color:'#F44336',rare:'Rara Dupla',price:3.40,base:true},
  {n:'009',dex:850,artist:'5ban Graphics',name:'Sizzlipede',type:'Fogo',color:'#F44336',rare:'Comum',price:0.13,base:true},
  {n:'010',dex:851,artist:'Yuya Oka',name:'Centiskorch',type:'Fogo',color:'#F44336',rare:'Comum',price:0.10,base:true},
  {n:'011',dex:935,artist:'Kouki Saitou',name:'Charcadet',type:'Fogo',color:'#F44336',rare:'Comum',price:0.10,base:true},
  {n:'012',dex:936,artist:'Ryuta Fuse',name:'Armarouge',type:'Fogo',color:'#F44336',rare:'Rara',price:0.24,base:true},
  {n:'013',dex:118,artist:'Jiro Sasumo',name:'Goldeen',type:'Agua',color:'#2196F3',rare:'Comum',price:0.10,base:true},
  {n:'014',dex:119,artist:'Shibuzoh.',name:'Seaking',type:'Agua',color:'#2196F3',rare:'Incomum',price:0.10,base:true},
  {n:'015',dex:320,artist:'OKUBO',name:'Wailmer',type:'Agua',color:'#2196F3',rare:'Comum',price:0.10,base:true},
  {n:'016',dex:321,artist:'Asako Ito',name:'Wailord ex',type:'Agua',color:'#2196F3',rare:'Rara Dupla',price:2.50,base:true},
  {n:'017',dex:369,artist:'5ban Graphics',name:'Relicanth',type:'Agua',color:'#2196F3',rare:'Incomum',price:0.10,base:true},
  {n:'018',dex:728,artist:'Naoyo Kimura',name:'Popplio',type:'Agua',color:'#2196F3',rare:'Comum',price:0.10,base:true},
  {n:'019',dex:729,artist:'Oswaldo KATO',name:'Brionne',type:'Agua',color:'#2196F3',rare:'Comum',price:0.09,base:true},
  {n:'020',dex:730,artist:'MINAMINAMI Take',name:'Primarina',type:'Agua',color:'#2196F3',rare:'Rara',price:0.20,base:true},
  {n:'021',dex:963,artist:'Taira Akitsu',name:'Finizen',type:'Agua',color:'#2196F3',rare:'Comum',price:0.10,base:true},
  {n:'022',dex:964,artist:'Yukiko Baba',name:'Palafin',type:'Agua',color:'#2196F3',rare:'Incomum',price:0.10,base:true},
  {n:'023',dex:309,artist:'satoma',name:'Electrike',type:'Eletrico',color:'#FFC107',rare:'Comum',price:0.10,base:true},
  {n:'024',dex:310,artist:'Dsuke',name:'Manectric',type:'Eletrico',color:'#FFC107',rare:'Incomum',price:0.10,base:true},
  {n:'025',dex:737,artist:'Uninori',name:'Charjabug',type:'Eletrico',color:'#FFC107',rare:'Comum',price:0.10,base:true},
  {n:'026',dex:738,artist:'Kazuhisa Uragami',name:'Vikavolt',type:'Eletrico',color:'#FFC107',rare:'Incomum',price:0.10,base:true},
  {n:'027',dex:807,artist:'KEIICHIRO ITO',name:'Mega Zeraora ex',type:'Eletrico',color:'#FFC107',rare:'Rara Dupla',price:3.40,base:true},
  {n:'028',dex:1008,artist:'5ban Graphics',name:'Miraidon',type:'Eletrico',color:'#FFC107',rare:'Rara',price:0.15,base:true},
  {n:'029',dex:79,artist:'mashu',name:'Slowpoke',type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0.13,base:true},
  {n:'030',dex:80,artist:'Nelnal',name:'Slowbro',type:'Psiquico',color:'#9C27B0',rare:'Incomum',price:0.10,base:true},
  {n:'031',dex:80,name:'Mega Slowbro ex',type:'Psiquico',color:'#9C27B0',rare:'Rara Dupla',price:3.79,base:true},
  {n:'032',dex:124,artist:'CHORISO',name:'Jynx',type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0.10,base:true},
  {n:'033',dex:353,artist:'5ban Graphics',name:'Shuppet',type:'Trevas',color:'#212121',rare:'Comum',price:0.14,base:true},
  {n:'034',dex:354,artist:'Yoshimoto Yoshimon',name:'Banette',type:'Trevas',color:'#212121',rare:'Incomum',price:0.14,base:true},
  {n:'035',dex:442,artist:'Bun Toujo',name:'Spiritomb',type:'Trevas',color:'#212121',rare:'Rara',price:0.25,base:true},
  {n:'036',dex:607,artist:'Mugi Hamada',name:'Litwick',type:'Fogo',color:'#F44336',rare:'Comum',price:0.10,base:true},
  {n:'037',dex:608,artist:'danciao',name:'Lampent',type:'Fogo',color:'#F44336',rare:'Incomum',price:0.10,base:true},
  {n:'038',dex:609,artist:'HYOGONOSUKE',name:'Mega Chandelure ex',type:'Fogo',color:'#F44336',rare:'Rara Dupla',price:4.75,base:true},
  {n:'039',dex:781,artist:'sowsow',name:'Dhelmise',type:'Grama',color:'#4CAF50',rare:'Incomum',price:0.14,base:true},
  {n:'040',dex:802,artist:'5ban Graphics',name:'Marshadow',type:'Trevas',color:'#212121',rare:'Incomum',price:0.10,base:true},
  {n:'041',dex:979,artist:'Oku',name:'Annihilape',type:'Luta',color:'#FF6B35',rare:'Incomum',price:0.10,base:true},
  {n:'042',dex:56,artist:'Nakamura Ippan',name:'Mankey',type:'Luta',color:'#FF6B35',rare:'Comum',price:0.10,base:true},
  {n:'043',dex:57,artist:'Haru Akasaka',name:'Primeape',type:'Luta',color:'#FF6B35',rare:'Comum',price:0.10,base:true},
  {n:'044',dex:408,name:'Cranidos',type:'Luta',color:'#FF6B35',rare:'Comum',price:0.10,base:true},
  {n:'045',dex:409,artist:'GOSSAN',name:'Rampardos ex',type:'Luta',color:'#FF6B35',rare:'Rara Dupla',price:2.49,base:true},
  {n:'046',dex:529,artist:'Hideki Ishikawa',name:'Drilbur',type:'Luta',color:'#FF6B35',rare:'Comum',price:0.10,base:true},
  {n:'047',dex:1007,artist:'hncl',name:'Koraidon',type:'Luta',color:'#FF6B35',rare:'Rara',price:0.19,base:true},
  {n:'048',dex:491,name:'Mega Darkrai ex',type:'Trevas',color:'#212121',rare:'Rara Dupla',price:6.65,base:true},
  {n:'049',dex:629,name:'Vullaby',type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'050',dex:630,artist:'5ban Graphics',name:'Mandibuzz',type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'051',dex:686,artist:'Shiburingaru',name:'Inkay',type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'052',dex:687,artist:'Nisota Niso',name:'Malamar',type:'Trevas',color:'#212121',rare:'Incomum',price:0.10,base:true},
  {n:'053',dex:827,artist:'Yuriko Akase',name:'Nickit',type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'054',dex:828,artist:'Naoki Saito',name:'Thievul',type:'Trevas',color:'#212121',rare:'Incomum',price:0.14,base:true},
  {n:'055',dex:877,artist:'Krgc',name:'Morpeko ex',type:'Eletrico',color:'#FFC107',rare:'Rara Dupla',price:2.87,base:true},
  {n:'056',dex:893,artist:'GOTO minori',name:'Zarude',type:'Trevas',color:'#212121',rare:'Rara',price:0.24,base:true},
  {n:'057',dex:942,artist:'aky GG Works',name:'Maschiff',type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'058',dex:943,artist:'matazo',name:'Mabosstiff',type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'059',dex:1004,artist:'ryoma uratsuka',name:'Chi-Yu',type:'Fogo',color:'#F44336',rare:'Rara',price:0.19,base:true},
  {n:'060',dex:227,artist:'kawayoo',name:'Skarmory',type:'Metal',color:'#607D8B',rare:'Comum',price:0.10,base:true},
  {n:'061',dex:410,artist:'IKEDA Saki',name:'Shieldon',type:'Metal',color:'#607D8B',rare:'Comum',price:0.14,base:true},
  {n:'062',dex:411,artist:'Anesaki Dynamic',name:'Bastiodon',type:'Metal',color:'#607D8B',rare:'Rara',price:0.25,base:true},
  {n:'063',dex:436,artist:'Kurata So',name:'Bronzor',type:'Metal',color:'#607D8B',rare:'Comum',price:0.10,base:true},
  {n:'064',dex:437,artist:'Kinu Nishimura',name:'Bronzong',type:'Metal',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'065',dex:530,artist:'Saboteri',name:'Mega Excadrill ex',type:'Luta',color:'#FF6B35',rare:'Rara Dupla',price:5.70,base:true},
  {n:'066',dex:731,artist:'Uta',name:'Pikipek',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0.10,base:true},
  {n:'067',dex:732,artist:'Keisuke Azuma',name:'Trumbeak',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0.10,base:true},
  {n:'068',dex:733,artist:'Koji Nakata',name:'Toucannon',type:'Incolor',color:'#9E9E9E',rare:'Incomum',price:0.18,base:true},
  {n:'069',dex:772,name:'Tipo Nulo',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0.10,base:true},
  {n:'070',dex:773,artist:'Masako Tomii',name:'Silvally',type:'Incolor',color:'#9E9E9E',rare:'Rara',price:0.16,base:true},
  {n:'071',dex:962,artist:'Ligton',name:'Bombirdier',type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'072',artist:'AYUMI ODASHIMA',name:'Antique Armor Fossil',type:'Treinador',color:'#607D8B',rare:'Comum',price:0.10,base:true},
  {n:'073',artist:'Wintr Wandr',name:'Antique Skull Fossil',type:'Treinador',color:'#607D8B',rare:'Comum',price:0.10,base:true},
  {n:'074',artist:'Toyste Beach',name:'Retry Badge',type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'075',artist:'Takumi Wada',name:'Dark Bell',type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.18,base:true},
  {n:'076',artist:'GIDORA',name:'Fossil Excavation Site',type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'077',artist:'Oswaldo KATO',name:"Gladion's Showdown",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.15,base:true},
  {n:'078',artist:'nagimiso',name:'Gwynn',type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.20,base:true},
  {n:'079',name:'Jett',type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'080',artist:'Toyste Beach',name:"Misty's Cheerfulness",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.14,base:true},
  {n:'081',artist:'akagi',name:'Rust Syndicate Grunt',type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'082',artist:'AYUMI ODASHIMA',name:'Terrific Bomb',type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'083',artist:'Teeziro',name:'Shadowy Darkness Energy',type:'Energia',color:'#212121',rare:'Rara',price:0.50,base:true},
  {n:'084',artist:'En Morikura',name:'Voltaic Lightning Energy',type:'Energia',color:'#FFC107',rare:'Rara',price:0.30,base:true},
  // ── SECRETAS 085–120 (acima do numero de regulacao) ─────
  // CORRIGIDO 18/07/2026: estavam todas com base:true, o que faz getSlots()
  // (app.js) cair no caso padrão [N, RH] — como se cada carta secreta tivesse
  // versão Normal E Reverse Holo. Art Rare/Super Rare/Special Art Rare/Mega
  // Ultra Rare são impressão única (mesma lógica já aplicada em cards_me04.js,
  // cards_me03.js, cards_meg.js pras cartas UR/Ilustr./Gold, que usam
  // base:false). Sem essa correção o master set do ME05 pedia 2 versões de
  // 37 cartas que só existem numa versão — 74 slots fantasmas. Ver [[project_pokemon_tcg]].
  {n:'085',dex:753,artist:'inose yukie',name:'Fomantis',type:'Grama',color:'#4CAF50',rare:'Rara Ilustrada',price:11.20,base:false},
  {n:'086',dex:936,name:'Armarouge',type:'Fogo',color:'#F44336',rare:'Rara Ilustrada',price:19.00,base:false},
  {n:'087',dex:118,name:'Goldeen',type:'Agua',color:'#2196F3',rare:'Rara Ilustrada',price:54.80,base:false},
  {n:'088',dex:730,artist:'Jiro Sasumo',name:'Primarina',type:'Agua',color:'#2196F3',rare:'Rara Ilustrada',price:21.00,base:false},
  {n:'089',dex:310,artist:'Iwamoto05',name:'Manectric',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:12.99,base:false},
  {n:'090',dex:80,artist:'Gemi',name:'Slowbro',type:'Psiquico',color:'#9C27B0',rare:'Rara Ilustrada',price:48.00,base:false},
  {n:'091',dex:781,artist:'satoma',name:'Dhelmise',type:'Grama',color:'#4CAF50',rare:'Rara Ilustrada',price:23.99,base:false},
  {n:'092',dex:828,artist:'HICO KIM',name:'Thievul',type:'Trevas',color:'#212121',rare:'Rara Ilustrada',price:7.90,base:false},
  {n:'093',dex:411,artist:'Nakamura Ippan',name:'Bastiodon',type:'Metal',color:'#607D8B',rare:'Rara Ilustrada',price:12.50,base:false},
  {n:'094',dex:733,artist:'Jerky',name:'Toucannon',type:'Incolor',color:'#9E9E9E',rare:'Rara Ilustrada',price:25.80,base:false},
  {n:'095',dex:773,artist:'Yoriyuki Ikegami',name:'Silvally',type:'Incolor',color:'#9E9E9E',rare:'Rara Ilustrada',price:15.00,base:false},
  {n:'096',dex:754,artist:'miki kudo',name:'Lurantis ex',type:'Grama',color:'#4CAF50',rare:'Ultra Rara',price:9.50,base:false},
  {n:'097',dex:321,artist:'DOM',name:'Wailord ex',type:'Agua',color:'#2196F3',rare:'Ultra Rara',price:15.29,base:false},
  {n:'098',dex:807,artist:'5ban Graphics',name:'Mega Zeraora ex',type:'Eletrico',color:'#FFC107',rare:'Ultra Rara',price:21.89,base:false},
  {n:'099',dex:609,artist:'5ban Graphics',name:'Mega Chandelure ex',type:'Fogo',color:'#F44336',rare:'Ultra Rara',price:34.65,base:false},
  {n:'100',dex:409,artist:'5ban Graphics',name:'Rampardos ex',type:'Luta',color:'#FF6B35',rare:'Ultra Rara',price:13.99,base:false},
  {n:'101',dex:491,artist:'5ban Graphics',name:'Mega Darkrai ex',type:'Trevas',color:'#212121',rare:'Ultra Rara',price:48.00,base:false},
  {n:'102',dex:877,artist:'5ban Graphics',name:'Morpeko ex',type:'Eletrico',color:'#FFC107',rare:'Ultra Rara',price:4.99,base:false},
  {n:'103',dex:530,artist:'5ban Graphics',name:'Mega Excadrill ex',type:'Luta',color:'#FF6B35',rare:'Ultra Rara',price:32.00,base:false},
  {n:'104',name:'Bracelete Bravio',type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:28.41,base:false},
  {n:'105',artist:'Toyste Beach',name:'Martelo Esmagador',type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:29.00,base:false},
  {n:'106',artist:'Ayaka Yoshida',name:'Dark Bell',type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:12.85,base:false},
  {n:'107',artist:'Keisuke Azuma',name:'Substituicao de Energia',type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:15.99,base:false},
  {n:'108',artist:'nagimiso',name:"Gladion's Showdown",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:23.99,base:false},
  {n:'109',artist:'En Morikura',name:'Gwynn',type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:59.18,base:false},
  {n:'110',artist:'5ban Graphics',name:'Defensor Ferreo',type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:7.99,base:false},
  {n:'111',artist:'akagi',name:"Misty's Spirit (Energia da Misty)",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:110.00,base:false},
  {n:'112',artist:'Studio Bora Inc.',name:'Rust Syndicate Grunt',type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:11.40,base:false},
  {n:'113',name:'Splendid Bomb',type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:11.99,base:false},
  {n:'114',dex:807,artist:'Teeziro',name:'Mega Zeraora ex',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada Especial',price:224.00,base:false},
  {n:'115',dex:609,artist:'inose yukie',name:'Mega Chandelure ex',type:'Fogo',color:'#F44336',rare:'Rara Ilustrada Especial',price:185.00,base:false},
  {n:'116',dex:491,artist:'GIDORA',name:'Mega Darkrai ex',type:'Trevas',color:'#212121',rare:'Rara Ilustrada Especial',price:699.90,base:false},
  {n:'117',dex:877,name:'Morpeko ex',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada Especial',price:229.90,base:false},
  {n:'118',artist:'AKIRA EGAWA',name:"Gladion's Showdown",type:'Treinador',color:'#607D8B',rare:'Rara Ilustrada Especial',price:134.90,base:false},
  {n:'119',artist:'NG Empire',name:'Gwynn',type:'Treinador',color:'#607D8B',rare:'Rara Ilustrada Especial',price:160.00,base:false},
  {n:'120',dex:491,artist:'DOM',name:'Mega Darkrai ex Gold',type:'Trevas',color:'#212121',rare:'Hiper Rara Mega',price:824.99,base:false},
];
