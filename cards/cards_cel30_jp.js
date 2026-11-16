// CEL30JP — 30th Celebration (M6a, japonês) — 141 cartas (AMPLIADO 01/10/2026)
// Lancamento Japao: 16 set 2026. Fonte base: limitlesstcg.com/cards/jp/M6a
// (30/09/2026) — nome japones + tipo + ilustrador conferidos carta a carta;
// SET DIFERENTE do cel30 em ingles/português (não é so uma tradução!):
// 103 cartas numeradas (sem Coleção Clássica, sem RGB Mew) + 8 Energias
// Básicas com letras G/R/W/L/P/F/D/M (aqui SÃO as 8 energias elementares —
// não confundir com as letras G/R/B do set em inglês, que lá são o trio
// ultra-raro do Mew).
// Species selecionadas tambem sao um SUBCONJUNTO do set em ingles (faltam
// ~22 pokemon que so existem na versao EN/PT, ex: Victini/Toxel/Zeraora/
// Comfey/Marill/Azumarill/Cresselia/Murkrow/Zorua/Zoroark/Deino/Zweilous/
// Hydreigon/Kangaskhan/Minior — conferido nome a nome contra a lista oficial
// japonesa, nao e erro de captura).
// AMPLIAÇÃO (01/10/2026): usuário pediu reconstrução a partir do dataset do
// GitHub (tcgdex/cards-database, PR #2356 "Add Japanese M set M6a 30th
// Celebration" — MERGEADA mas ainda não publicada na API pública do tcgdex),
// que confirma o total oficial do set em 176 cartas (103 base + 32 secretas
// 104-135 + 30 Coleção Clássica 136-165 + 3 RGB especiais B/G/R). Verificado
// carta a carta contra o CDN de imagens do limitlesstcg (mesmo provedor já
// usado nas 111 originais): as 30 cartas da COLEÇÃO CLÁSSICA (136-165) TÊM
// imagem confirmada nesse CDN e foram adicionadas abaixo (nameJp/illustrator
// vêm direto do tcgdex, name/type/color cruzados por dex contra o
// cards_cel30.js EN/PT, mesmo método usado no cards_cel30_cn.js). As 32
// secretas (104-135) e as 3 RGB (B/G/R) NÃO têm imagem nesse CDN (testado
// numero a numero, nenhuma resposta valida) nem em nenhuma outra fonte
// confirmada — ficaram de fora deste arquivo por enquanto pra não mostrar
// carta quebrada; o tcgdex TEM o texto delas (dex/raridade/ilustrador) caso
// uma fonte de imagem apareça depois.
// RARIDADE: a fonte NÃO mostra raridade em texto pras cartas japonesas
// (so teria via icone, sem alt-text acessivel) — inferida por cruzamento
// de especie com a raridade ja confirmada no cards_cel30.js (mesma carta,
// mesmo tier em qualquer regiao, assumido — nao confirmado 1:1 pro Japao).
// PREÇO: sem fonte de mercado japones confirmada — todas as cartas entram
// com price:0 até alguem achar uma fonte de preço JP confiável (Yahoo
// Auctions Japan, cardrush.jp etc. — fora do alcance deste sandbox).
// dex: reaproveitado do cards_cel30.js por espécie (mesmo Pokémon = mesmo
// dex, independente de região/idioma). Artista: mesmo dado do limitlesstcg/
// tcgdex (a arte é a mesma peça original, só o texto da carta muda por idioma).
const CARDS_CEL30JP = [
  // ── SET BASE 001–103 ─────────────────────────────────────
  {n:'001',dex:102,artist:'Nelnal',name:'Exeggcute',nameJp:'タマタマ',type:'Grama',color:'#4CAF50',rare:'Comum',price:0,base:true},
  {n:'002',dex:103,artist:'Oswaldo KATO',name:'Exeggutor de Alola',nameEn:'Alolan Exeggutor',nameJp:'アローラ ナッシー',type:'Grama',color:'#4CAF50',rare:'Comum',price:0,base:true},
  {n:'003',dex:313,artist:'Yoriyuki Ikegami',name:'Volbeat',nameJp:'バルビート',type:'Grama',color:'#4CAF50',rare:'Comum',price:0,base:true},
  {n:'004',dex:314,artist:'Shibuzoh.',name:'Illumise',nameJp:'イルミーゼ',type:'Grama',color:'#4CAF50',rare:'Comum',price:0,base:true},
  {n:'005',dex:666,artist:'Jerky',name:'Vivillon',nameJp:'ビビヨン',type:'Grama',color:'#4CAF50',rare:'Comum',price:0,base:true},
  {n:'006',dex:146,artist:'HYOGONOSUKE',name:'Moltres',nameJp:'ファイヤー',type:'Fogo',color:'#F44336',rare:'Comum',price:0,base:true},
  {n:'007',dex:250,artist:'Anesaki Dynamic',name:'Ho-Oh',nameJp:'ホウオウ',type:'Fogo',color:'#F44336',rare:'Rara',price:0,base:true},
  {n:'008',dex:643,artist:'Uta',name:'Reshiram',nameJp:'レシラム',type:'Fogo',color:'#F44336',rare:'Rara',price:0,base:true},
  {n:'009',dex:909,artist:'5ban Graphics',name:'Fuecoco ex',nameJp:'ホゲータex',type:'Fogo',color:'#F44336',rare:'Rara Dupla',price:0,base:true},
  {n:'010',dex:79,artist:'Uninori',name:'Slowpoke',nameJp:'ヤドン',type:'Agua',color:'#2196F3',rare:'Comum',price:0,base:true},
  {n:'011',dex:131,artist:'Masa',name:'Lapras',nameJp:'ラプラス',type:'Agua',color:'#2196F3',rare:'Comum',price:0,base:true},
  {n:'012',dex:144,artist:'HYOGONOSUKE',name:'Articuno',nameJp:'フリーザー',type:'Agua',color:'#2196F3',rare:'Comum',price:0,base:true},
  {n:'013',dex:382,artist:'Tonji Matsuno',name:'Kyogre',nameJp:'カイオーガ',type:'Agua',color:'#2196F3',rare:'Rara',price:0,base:true},
  {n:'014',dex:484,artist:'kawayoo',name:'Palkia',nameJp:'パルキア',type:'Agua',color:'#2196F3',rare:'Rara',price:0,base:true},
  {n:'015',dex:658,artist:'5ban Graphics',name:'Greninja ex',nameJp:'ゲッコウガex',type:'Agua',color:'#2196F3',rare:'Rara Dupla',price:0,base:true},
  {n:'016',dex:746,artist:'Narano',name:'Wishiwashi',nameJp:'ヨワシ',type:'Agua',color:'#2196F3',rare:'Comum',price:0,base:true},
  {n:'017',dex:25,artist:'Ken Sugimori',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'018',dex:25,artist:'danciao',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'019',dex:25,artist:'satoma',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'020',dex:25,artist:'Takeshi Nakamura',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'021',dex:25,artist:'Asako Ito',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'022',dex:25,artist:'sowsow',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'023',dex:25,artist:'James Turner',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'024',dex:25,artist:'DOM',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'025',dex:25,artist:'Atsushi Furusawa',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'026',dex:25,artist:'Tomokazu Komiya',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'027',dex:25,artist:'Narumi Sato',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'028',dex:25,artist:'USGMEN',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'029',dex:25,artist:'Susumu Maeya',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'030',dex:25,artist:'OKACHEKE',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'031',dex:25,artist:'Yuu Nishida',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'032',dex:25,artist:'Tetsu Kayama',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'033',dex:25,artist:'Teeziro',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'034',dex:25,artist:'Shinji Kanda',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'035',dex:25,artist:'Rianti Hidayat',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'036',dex:25,artist:'Akira Komayama',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'037',dex:25,artist:'OOYAMA',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'038',dex:25,artist:'akagi',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'039',dex:25,artist:'Naoyo Kimura',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'040',dex:25,artist:'svlt',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'041',dex:25,artist:'Atsuko Nishida',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'042',dex:25,artist:'KIYOTAKA OSHIYAMA',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'043',dex:25,artist:'Nurikabe',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'044',dex:25,artist:'Shimaris Yukichi',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'045',dex:25,artist:'nagimiso',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'046',dex:25,artist:'Kazuki Minami',name:'Pikachu',nameJp:'ピカチュウ',type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:0,base:true},
  {n:'047',dex:25,artist:'5ban Graphics',name:'Pikachu ex',nameJp:'ピカチュウex',type:'Eletrico',color:'#FFC107',rare:'Rara Dupla',price:0,base:true},
  {n:'048',dex:25,artist:'takuyoa',name:'Pikachu ex',nameJp:'ピカチュウex',type:'Eletrico',color:'#FFC107',rare:'Rara Dupla',price:0,base:true},
  {n:'049',dex:145,artist:'HYOGONOSUKE',name:'Zapdos',nameJp:'サンダー',type:'Eletrico',color:'#FFC107',rare:'Comum',price:0,base:true},
  {n:'050',dex:644,artist:'akagi',name:'Zekrom',nameJp:'ゼクロム',type:'Eletrico',color:'#FFC107',rare:'Rara',price:0,base:true},
  {n:'051',dex:849,artist:'Yuriko Akase',name:'Toxtricity',nameJp:'ストリンダー',type:'Eletrico',color:'#FFC107',rare:'Comum',price:0,base:true},
  {n:'052',dex:877,artist:'Naoki Saito',name:'Morpeko',nameJp:'モルペコ',type:'Eletrico',color:'#FFC107',rare:'Comum',price:0,base:true},
  {n:'053',dex:1008,artist:'Kazumasa Yasukuni',name:'Miraidon',nameJp:'ミライドン',type:'Eletrico',color:'#FFC107',rare:'Rara',price:0,base:true},
  {n:'054',dex:150,artist:'nagimiso',name:'Mewtwo',nameJp:'ミュウツー',type:'Psiquico',color:'#9C27B0',rare:'Rara',price:0,base:true},
  {n:'055',dex:150,artist:'5ban Graphics',name:'Mewtwo ex',nameJp:'ミュウツーex',type:'Psiquico',color:'#9C27B0',rare:'Rara Dupla',price:0,base:true},
  {n:'056',dex:151,artist:'danciao',name:'Mew',nameJp:'ミュウ',type:'Psiquico',color:'#9C27B0',rare:'Rara',price:0,base:true},
  {n:'057',dex:151,artist:'aky CG Works',name:'Mew ex',nameJp:'ミュウex',type:'Psiquico',color:'#9C27B0',rare:'Rara Dupla',price:0,base:true},
  {n:'058',dex:196,artist:'aspara',name:'Espeon',nameJp:'エーフィ',type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0,base:true},
  {n:'059',dex:700,artist:'5ban Graphics',name:'Sylveon ex',nameJp:'ニンフィアex',type:'Psiquico',color:'#9C27B0',rare:'Rara Dupla',price:0,base:true},
  {n:'060',dex:201,artist:'mingo',name:'Unown',nameJp:'アンノーン',type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0,base:true},
  {n:'061',dex:425,artist:'Shinya Komatsu',name:'Drifloon',nameJp:'フワンテ',type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0,base:true},
  {n:'062',dex:609,artist:'Yoshioka',name:'Chandelure',nameJp:'シャンデラ',type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0,base:true},
  {n:'063',dex:716,artist:'kodama',name:'Xerneas',nameJp:'ゼルネアス',type:'Psiquico',color:'#9C27B0',rare:'Rara',price:0,base:true},
  {n:'064',dex:789,artist:'Mina Nakai',name:'Cosmog',nameJp:'コスモッグ',type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0,base:true},
  {n:'065',dex:790,artist:'Masako Tomii',name:'Cosmoem',nameJp:'コスモウム',type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0,base:true},
  {n:'066',dex:792,artist:'Bun Toujo',name:'Lunala',nameJp:'ルナアーラ',type:'Psiquico',color:'#9C27B0',rare:'Rara',price:0,base:true},
  {n:'067',dex:999,artist:'Fujimoto Gold',name:'Gimmighoul',nameJp:'コレクレー',type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0,base:true},
  {n:'068',dex:383,artist:'Takumi Wada',name:'Groudon',nameJp:'グラードン',type:'Luta',color:'#FF6B35',rare:'Rara',price:0,base:true},
  {n:'069',dex:448,artist:'Hideki Ishikawa',name:'Lucario',nameJp:'ルカリオ',type:'Luta',color:'#FF6B35',rare:'Comum',price:0,base:true},
  {n:'070',dex:537,artist:'Kurata So',name:'Seismitoad',nameJp:'ガマゲロゲ',type:'Luta',color:'#FF6B35',rare:'Comum',price:0,base:true},
  {n:'071',dex:745,artist:'matazo',name:'Lycanroc',nameJp:'ルガルガン',type:'Luta',color:'#FF6B35',rare:'Comum',price:0,base:true},
  {n:'072',dex:1007,artist:'Mitsuhiro Arita',name:'Koraidon',nameJp:'コライドン',type:'Luta',color:'#FF6B35',rare:'Rara',price:0,base:true},
  {n:'073',dex:29,artist:'Taira Akitsu',name:'Nidoran Fêmea',nameEn:'Nidoran♀',nameJp:'ニドラン♀',type:'Trevas',color:'#212121',rare:'Comum',price:0,base:true},
  {n:'074',dex:30,artist:'Miki Tanaka',name:'Nidorina',nameJp:'ニドリーナ',type:'Trevas',color:'#212121',rare:'Comum',price:0,base:true},
  {n:'075',dex:52,artist:'Natsumi Yoshida',name:'Meowth de Alola',nameEn:'Alolan Meowth',nameJp:'アローラ ニャース',type:'Trevas',color:'#212121',rare:'Comum',price:0,base:true},
  {n:'076',dex:94,artist:'5ban Graphics',name:'Gengar ex',nameJp:'ゲンガーex',type:'Trevas',color:'#212121',rare:'Rara Dupla',price:0,base:true},
  {n:'077',dex:197,artist:'Iori Suzuki',name:'Umbreon',nameJp:'ブラッキー',type:'Trevas',color:'#212121',rare:'Comum',price:0,base:true},
  {n:'078',dex:559,artist:'Souichirou Gunjima',name:'Scraggy',nameJp:'ズルッグ',type:'Trevas',color:'#212121',rare:'Comum',price:0,base:true},
  {n:'079',dex:717,artist:'hncl',name:'Yveltal',nameJp:'イベルタル',type:'Trevas',color:'#212121',rare:'Rara',price:0,base:true},
  {n:'080',dex:52,artist:'Mékayu',name:'Meowth de Galar',nameEn:'Galarian Meowth',nameJp:'ガラル ニャース',type:'Metal',color:'#607D8B',rare:'Comum',price:0,base:true},
  {n:'081',dex:385,artist:'5ban Graphics',name:'Jirachi ex',nameJp:'ジラーチex',type:'Metal',color:'#607D8B',rare:'Rara Dupla',price:0,base:true},
  {n:'082',dex:483,artist:'toriyufu',name:'Dialga',nameJp:'ディアルガ',type:'Metal',color:'#607D8B',rare:'Rara',price:0,base:true},
  {n:'083',dex:598,artist:'Po-Suzuki',name:'Ferrothorn',nameJp:'ナットレイ',type:'Metal',color:'#607D8B',rare:'Comum',price:0,base:true},
  {n:'084',dex:791,artist:'Nurikabe',name:'Solgaleo',nameJp:'ソルガレオ',type:'Metal',color:'#607D8B',rare:'Rara',price:0,base:true},
  {n:'085',dex:888,artist:'AKIRA EGAWA',name:'Zacian',nameJp:'ザシアン',type:'Metal',color:'#607D8B',rare:'Rara',price:0,base:true},
  {n:'086',dex:889,artist:'Tsuyoshi Nagano',name:'Zamazenta',nameJp:'ザマゼンタ',type:'Metal',color:'#607D8B',rare:'Rara',price:0,base:true},
  {n:'087',dex:1000,artist:'Sanosuke Sakuma',name:'Gholdengo',nameJp:'サーフゴー',type:'Metal',color:'#607D8B',rare:'Comum',price:0,base:true},
  {n:'088',dex:373,artist:'5ban Graphics',name:'Salamence ex',nameJp:'ボーマンダex',type:'Dragao',color:'#673AB7',rare:'Rara Dupla',price:0,base:true},
  {n:'089',dex:782,artist:'miki kudo',name:'Jangmo-o',nameJp:'ジャラコ',type:'Dragao',color:'#673AB7',rare:'Comum',price:0,base:true},
  {n:'090',dex:783,artist:'Jiro Sasumo',name:'Hakamo-o',nameJp:'ジャランゴ',type:'Dragao',color:'#673AB7',rare:'Comum',price:0,base:true},
  {n:'091',dex:784,artist:'MARINA Chikazawa',name:'Kommo-o',nameJp:'ジャラランガ',type:'Dragao',color:'#673AB7',rare:'Comum',price:0,base:true},
  {n:'092',dex:52,artist:'MINAMINAMI Take',name:'Meowth',nameJp:'ニャース',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0,base:true},
  {n:'093',dex:132,artist:'Toshinao Aoki',name:'Ditto',nameJp:'メタモン',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0,base:true},
  {n:'094',dex:133,artist:'Wintr Wandr',name:'Eevee',nameJp:'イーブイ',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0,base:true},
  {n:'095',dex:143,artist:'Aya Kusube',name:'Snorlax',nameJp:'カビゴン',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0,base:true},
  {n:'096',dex:174,artist:'Kanami Ogata',name:'Igglybuff',nameJp:'ププリン',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0,base:true},
  {n:'097',dex:249,artist:'Kazuki Minami',name:'Lugia',nameJp:'ルギア',type:'Incolor',color:'#9E9E9E',rare:'Rara',price:0,base:true},
  {n:'098',dex:570,artist:'Megumi Mizutani',name:'Zorua de Hisui',nameEn:'Hisuian Zorua',nameJp:'ヒスイ ゾロア',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0,base:true},
  {n:'099',dex:571,artist:'Kamome Shirahama',name:'Zoroark de Hisui',nameEn:'Hisuian Zoroark',nameJp:'ヒスイ ゾロアーク',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0,base:true},
  {n:'100',dex:925,artist:'Kariya',name:'Maushold',nameJp:'イッカネズミ',type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0,base:true},
  {n:'101',artist:'Yuka Morii',name:'Ultra Bola',nameEn:'Ultra Ball',nameJp:'ハイパーボール',type:'Treinador',color:'#607D8B',rare:'Comum',price:0,base:true},
  {n:'102',artist:'Yuka Morii',name:'Poké Tablet',nameEn:'Poké Pad',nameJp:'ポケパッド',type:'Treinador',color:'#607D8B',rare:'Comum',price:0,base:true},
  {n:'103',artist:'Yuka Morii',name:'Substituição',nameEn:'Switch',nameJp:'ポケモンいれかえ',type:'Treinador',color:'#607D8B',rare:'Comum',price:0,base:true},
  // ── COLEÇÃO CLÁSSICA 136–165 (numeração própria do tcgdex, igual ao EN/CN) ──
  {n:"136",dex:25,artist:"Mitsuhiro Arita",name:"Pikachu",nameJp:"ピカチュウ",type:"Eletrico",color:"#FFC107",rare:"Coleção Clássica",price:0,base:false},
  {n:"137",dex:6,artist:"Mitsuhiro Arita",name:"Charizard",nameJp:"リザードン",type:"Fogo",color:"#F44336",rare:"Coleção Clássica",price:0,base:false},
  {n:"138",artist:"Ken Sugimori",name:"Misty",nameJp:"カスミ",type:"Treinador",color:"#607D8B",rare:"Coleção Clássica",price:0,base:false},
  {n:"139",dex:39,artist:"Ken Sugimori",name:"Jigglypuff da Érica",nameEn:"Erika's Jigglypuff",nameJp:"エリカのプリン",type:"Incolor",color:"#9E9E9E",rare:"Coleção Clássica",price:0,base:false},
  {n:"140",dex:215,artist:"Ken Sugimori",name:"Sneasel",nameJp:"ニューラ",type:"Trevas",color:"#212121",rare:"Coleção Clássica",price:0,base:false},
  {n:"141",dex:251,artist:"Hironobu Yoshida",name:"Celebi Luminescente",nameEn:"Shining Celebi",nameJp:"ひかるセレビィ",type:"Grama",color:"#4CAF50",rare:"Coleção Clássica",price:0,base:false},
  {n:"142",dex:249,artist:"Naoyo Kimura",name:"Lugia",nameJp:"ルギア",type:"Incolor",color:"#9E9E9E",rare:"Coleção Clássica",price:0,base:false},
  {n:"143",dex:301,artist:"Atsuko Nishida",name:"Delcatty",nameJp:"エネコロロ",type:"Incolor",color:"#9E9E9E",rare:"Coleção Clássica",price:0,base:false},
  {n:"144",dex:248,artist:"Nakaoka",name:"Tyranitar Sombrio",nameEn:"Dark Tyranitar",nameJp:"わるいバンギラス",type:"Trevas",color:"#212121",rare:"Coleção Clássica",price:0,base:false},
  {n:"145",dex:212,artist:"Mitsuhiro Arita",name:"Scizor ex",nameJp:"ハッサムex",type:"Metal",color:"#607D8B",rare:"Coleção Clássica",price:0,base:false},
  {n:"146",dex:376,artist:"Masakazu Fukuda",name:"Metagross δ",nameEn:"Metagross",nameJp:"メタグロス",type:"Eletrico",color:"#FFC107",rare:"Coleção Clássica",price:0,base:false},
  {n:"147",dex:484,artist:"Ryo Ueda",name:"Palkia LV.X",nameJp:"パルキア",type:"Agua",color:"#2196F3",rare:"Coleção Clássica",price:0,base:false},
  {n:"148",dex:480,artist:"Ken Sugimori",name:"Uxie",nameJp:"ユクシー",type:"Psiquico",color:"#9C27B0",rare:"Coleção Clássica",price:0,base:false},
  {n:"149",dex:169,artist:"Makoto Imai",name:"Crobat G",nameJp:"クロバットG",type:"Psiquico",color:"#9C27B0",rare:"Coleção Clássica",price:0,base:false},
  {n:"150",dex:94,artist:"Takashi Yamaguchi",name:"Gengar",nameJp:"ゲンガー",type:"Psiquico",color:"#9C27B0",rare:"Coleção Clássica",price:0,base:false},
  {n:"151",dex:491,artist:"Shinji Higuchi & Noriko Takaya",name:"Darkrai & Cresselia LEGEND",nameJp:"ダークライ＆クレセリアLEGEND",type:"Trevas",color:"#212121",rare:"Coleção Clássica",price:0,base:false},
  {n:"152",dex:488,artist:"Shinji Higuchi & Noriko Takaya",name:"Darkrai & Cresselia LEGEND",nameJp:"ダークライ＆クレセリアLEGEND",type:"Trevas",color:"#212121",rare:"Coleção Clássica",price:0,base:false},
  {n:"153",artist:"Ken Sugimori",name:"N",nameJp:"N",type:"Treinador",color:"#607D8B",rare:"Coleção Clássica",price:0,base:false},
  {n:"154",dex:384,artist:"Eske Yoshinob",name:"Rayquaza-EX",nameJp:"レックウザEX",type:"Dragao",color:"#673AB7",rare:"Coleção Clássica",price:0,base:false},
  {n:"155",dex:649,artist:"Eske Yoshinob",name:"Genesect-EX",nameJp:"ゲノセクトEX",type:"Grama",color:"#4CAF50",rare:"Coleção Clássica",price:0,base:false},
  {n:"156",dex:282,artist:"5ban Graphics",name:"M Gardevoir-EX",nameJp:"サーナイトEX",type:"Psiquico",color:"#9C27B0",rare:"Coleção Clássica",price:0,base:false},
  {n:"157",dex:658,artist:"5ban Graphics",name:"Greninja BREAK",nameJp:"ゲッコウガBREAK",type:"Agua",color:"#2196F3",rare:"Coleção Clássica",price:0,base:false},
  {n:"158",dex:791,artist:"PLANETA",name:"Solgaleo-GX",nameJp:"ソルガレオGX",type:"Metal",color:"#607D8B",rare:"Coleção Clássica",price:0,base:false},
  {n:"159",dex:794,artist:"5ban Graphics",name:"Buzzwole-GX",nameJp:"マッシブーンGX",type:"Luta",color:"#FF6B35",rare:"Coleção Clássica",price:0,base:false},
  {n:"160",dex:25,artist:"Mitsuhiro Arita",name:"Pikachu e Zekrom-GX",nameEn:"Pikachu & Zekrom-GX",nameJp:"ピカチュウ&ゼクロムGX",type:"Eletrico",color:"#FFC107",rare:"Coleção Clássica",price:0,base:false},
  {n:"161",dex:888,artist:"5ban Graphics",name:"Zacian-V",nameEn:"Zacian V",nameJp:"ザシアンV",type:"Metal",color:"#607D8B",rare:"Coleção Clássica",price:0,base:false},
  {n:"162",dex:243,artist:"Hideki Ishikawa",name:"Raikou",nameJp:"ライコウ",type:"Eletrico",color:"#FFC107",rare:"Coleção Clássica",price:0,base:false},
  {n:"163",dex:151,artist:"5ban Graphics",name:"Mew-VMAX",nameEn:"Mew VMAX",nameJp:"ミュウVMAX",type:"Psiquico",color:"#9C27B0",rare:"Coleção Clássica",price:0,base:false},
  {n:"164",dex:493,artist:"5ban Graphics",name:"Arceus VSTAR",nameJp:"アルセウスVSTAR",type:"Incolor",color:"#9E9E9E",rare:"Coleção Clássica",price:0,base:false},
  {n:"165",dex:129,artist:"Shinji Kanda",name:"Magikarp",nameJp:"コイキング",type:"Agua",color:"#2196F3",rare:"Coleção Clássica",price:0,base:false},
  // ── ENERGIAS BÁSICAS (8 cartas bonus, letras G/R/W/L/P/F/D/M) ──
  {n:'G',artist:'YOSHIROTTEN',name:'Energia de Planta Básica',nameEn:'Basic Grass Energy',nameJp:'基本草エネルギー',type:'Energia',color:'#4CAF50',rare:'Comum',price:0,base:false},
  {n:'R',artist:'YOSHIROTTEN',name:'Energia de Fogo Básica',nameEn:'Basic Fire Energy',nameJp:'基本炎エネルギー',type:'Energia',color:'#F44336',rare:'Comum',price:0,base:false},
  {n:'W',artist:'YOSHIROTTEN',name:'Energia de Água Básica',nameEn:'Basic Water Energy',nameJp:'基本水エネルギー',type:'Energia',color:'#2196F3',rare:'Comum',price:0,base:false},
  {n:'L',artist:'YOSHIROTTEN',name:'Energia de Raio Básica',nameEn:'Basic Lightning Energy',nameJp:'基本雷エネルギー',type:'Energia',color:'#FFC107',rare:'Comum',price:0,base:false},
  {n:'P',artist:'YOSHIROTTEN',name:'Energia Psíquica Básica',nameEn:'Basic Psychic Energy',nameJp:'基本超エネルギー',type:'Energia',color:'#9C27B0',rare:'Comum',price:0,base:false},
  {n:'F',artist:'YOSHIROTTEN',name:'Energia de Luta Básica',nameEn:'Basic Fighting Energy',nameJp:'基本闘エネルギー',type:'Energia',color:'#FF6B35',rare:'Comum',price:0,base:false},
  {n:'D',artist:'YOSHIROTTEN',name:'Energia de Escuridão Básica',nameEn:'Basic Darkness Energy',nameJp:'基本悪エネルギー',type:'Energia',color:'#212121',rare:'Comum',price:0,base:false},
  {n:'M',artist:'YOSHIROTTEN',name:'Energia de Metal Básica',nameEn:'Basic Metal Energy',nameJp:'基本鋼エネルギー',type:'Energia',color:'#607D8B',rare:'Comum',price:0,base:false},
];
