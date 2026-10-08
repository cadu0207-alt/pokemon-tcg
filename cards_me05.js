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
//
// IDIOMAS + ILUSTRADORES (03/10/2026, mesmo padrão do ME2.5 — ver cards_me2pt5.js):
// - name = português (tcgdex.net, slug "me05"); nameEn só quando difere do PT (Treinador/Energia e
//   "Tipo Nulo"/Type: Null). Nomes que estavam em inglês cru ou sem acento foram trocados pelo PT oficial
//   (ex: "Gladion's Showdown" -> "Batalha Decisiva do Gladio" [EN real: Gladion's Final Battle];
//   "Gwynn" -> "Clarita"; "Misty's Cheerfulness" -> "Vitalidade da Misty").
// - nameJp/img = print japonês de cada carta, resolvido pela tabela "JP. Prints" de limitlesstcg.com/cards/PBL/{n}
//   (set JP M5 "Abyss Eye": 117 cartas casadas; o JP tem 118 e o intl 120). Quando uma carta tem vários prints
//   no M5 (normal/SR/SAR/UR), o n-ésimo print do intl casa com o n-ésimo do JP em ordem crescente.
//   EXCEÇÃO: #008 Mega Delphox ex, #031 Mega Slowbro ex e #079 Jett saíram no JP pelo set MP (MP_96/MP_71/MP_75),
//   não no M5. O Zarude Ilustração Rara do JP (M5/90) não tem par no intl. Conferência: nome JP bate entre
//   limitlesstcg e tcgdex (117/117 do M5), ilustrador bate entre a página intl e a JP (118/118), e a imagem de
//   cada URL foi verificada (HEAD, image/png).
// - artist: estava DESLOCADO 1 posição desde a #009 (a correção de 24/07 mexeu em dex/numeração e não nele).
//   Refeito pelo limitlesstcg e conferido 120/120 contra o tcgdex (#083/#084, Energias Especiais, não têm
//   ilustrador na carta — campo removido em vez de manter o valor errado).
// - Chinês: não existe (a série Megaevolução chinesa ainda não tem set principal; tcgdex zh-cn termina em
//   CSV9.5C, era Escarlate e Violeta). Fica de fora até a China lançar.
// - Imagem PT/EN vem do tcgdex (assets.tcgdex.net/{pt|en}/me/me05/NNN/high.png); a #107 não tem arte PT lá
//   (404) — o fichário cai sozinho na arte EN (handleCardImgError).
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
  {n:'001',dex:357,artist:'Akino Fukuji',name:"Tropius",nameJp:"トロピウス",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_1_R_JP_LG.png",type:'Grama',color:'#4CAF50',rare:'Comum',price:0.10,base:true},
  {n:'002',dex:736,artist:'Mina Nakai',name:"Grubbin",nameJp:"アゴジムシ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_2_R_JP_LG.png",type:'Grama',color:'#4CAF50',rare:'Comum',price:0.10,base:true},
  {n:'003',dex:753,artist:'nisimono',name:"Fomantis",nameJp:"カリキリ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_3_R_JP_LG.png",type:'Grama',color:'#4CAF50',rare:'Comum',price:0.10,base:true},
  {n:'004',dex:754,artist:'5ban Graphics',name:"Lurantis ex",nameJp:"ラランテスex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_4_R_JP_LG.png",type:'Grama',color:'#4CAF50',rare:'Rara Dupla',price:2.48,base:true},
  {n:'005',dex:1012,artist:'Mousho',name:"Poltchageist",nameJp:"チャデス",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_5_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Comum',price:0.09,base:true},
  {n:'006',dex:1013,artist:'mingo',name:"Sinistcha",nameJp:"ヤバソチャ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_6_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Incomum',price:0.13,base:true},
  {n:'007',dex:485,artist:'Takeshi Nakamura',name:"Heatran",nameJp:"ヒードラン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_7_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Incomum',price:0.10,base:true},
  {n:'008',dex:655,artist:"5ban Graphics",name:"Mega Delphox ex",nameJp:"メガマフォクシーex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/MP/MP_96_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Rara Dupla',price:3.79,base:true},
  {n:'009',dex:850,artist:"Yuya Oka",name:"Sizzlipede",nameJp:"ヤクデ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_8_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Comum',price:0.05,base:true},
  {n:'010',dex:851,artist:"Kouki Saitou",name:"Centiskorch",nameJp:"マルヤクデ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_9_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Comum',price:0.05,base:true},
  {n:'011',dex:935,artist:"Ryuta Fuse",name:"Charcadet",nameJp:"カルボウ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_10_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Comum',price:0.10,base:true},
  {n:'012',dex:936,artist:"Jiro Sasumo",name:"Armarouge",nameJp:"グレンアルマ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_11_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Rara',price:0.19,base:true},
  {n:'013',dex:118,artist:"Shibuzoh.",name:"Goldeen",nameJp:"トサキント",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_12_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Comum',price:0.05,base:true},
  {n:'014',dex:119,artist:"OKUBO",name:"Seaking",nameJp:"アズマオウ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_13_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Incomum',price:0.15,base:true},
  {n:'015',dex:320,artist:"Asako Ito",name:"Wailmer",nameJp:"ホエルコ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_14_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Comum',price:0.10,base:true},
  {n:'016',dex:321,artist:"5ban Graphics",name:"Wailord ex",nameJp:"ホエルオーex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_15_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Rara Dupla',price:1.90,base:true},
  {n:'017',dex:369,artist:"Naoyo Kimura",name:"Relicanth",nameJp:"ジーランス",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_16_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Incomum',price:0.09,base:true},
  {n:'018',dex:728,artist:"Oswaldo KATO",name:"Popplio",nameJp:"アシマリ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_17_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Comum',price:0.10,base:true},
  {n:'019',dex:729,artist:"MINAMINAMI Take",name:"Brionne",nameJp:"オシャマリ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_18_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Comum',price:0.09,base:true},
  {n:'020',dex:730,artist:"Taira Akitsu",name:"Primarina",nameJp:"アシレーヌ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_19_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Rara',price:0.20,base:true},
  {n:'021',dex:963,artist:"Yukiko Baba",name:"Finizen",nameJp:"ナミイルカ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_20_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Comum',price:0.07,base:true},
  {n:'022',dex:964,artist:"satoma",name:"Palafin",nameJp:"イルカマン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_21_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Incomum',price:0.10,base:true},
  {n:'023',dex:309,artist:"Dsuke",name:"Electrike",nameJp:"ラクライ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_22_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Comum',price:0.10,base:true},
  {n:'024',dex:310,artist:"Uninori",name:"Manectric",nameJp:"ライボルト",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_23_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Incomum',price:0.10,base:true},
  {n:'025',dex:737,artist:"Kazuhisa Uragami",name:"Charjabug",nameJp:"デンヂムシ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_24_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Comum',price:0.10,base:true},
  {n:'026',dex:738,artist:"KEIICHIRO ITO",name:"Vikavolt",nameJp:"クワガノン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_25_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Incomum',price:0.10,base:true},
  {n:'027',dex:807,artist:"5ban Graphics",name:"Mega Zeraora ex",nameJp:"メガゼラオラex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_26_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Rara Dupla',price:3.40,base:true},
  {n:'028',dex:1008,artist:"mashu",name:"Miraidon",nameJp:"ミライドン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_27_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Rara',price:0.12,base:true},
  {n:'029',dex:79,artist:"Nelnal",name:"Slowpoke",nameJp:"ヤドン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_28_R_JP_LG.png",type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0.13,base:true},
  {n:'030',dex:80,artist:"CHORISO",name:"Slowbro",nameJp:"ヤドラン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_29_R_JP_LG.png",type:'Psiquico',color:'#9C27B0',rare:'Incomum',price:0.10,base:true},
  {n:'031',dex:80,artist:"5ban Graphics",name:"Mega Slowbro ex",nameJp:"メガヤドランex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/MP/MP_71_R_JP_LG.png",type:'Psiquico',color:'#9C27B0',rare:'Rara Dupla',price:4.00,base:true},
  {n:'032',dex:124,artist:"Yoshimoto Yoshimon",name:"Jynx",nameJp:"ルージュラ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_30_R_JP_LG.png",type:'Psiquico',color:'#9C27B0',rare:'Comum',price:0.09,base:true},
  {n:'033',dex:353,artist:"Bun Toujo",name:"Shuppet",nameJp:"カゲボウズ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_31_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'034',dex:354,artist:"Mugi Hamada",name:"Banette",nameJp:"ジュペッタ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_32_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Incomum',price:0.10,base:true},
  {n:'035',dex:442,artist:"danciao",name:"Spiritomb",nameJp:"ミカルゲ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_33_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Rara',price:0.18,base:true},
  {n:'036',dex:607,artist:"HYOGONOSUKE",name:"Litwick",nameJp:"ヒトモシ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_34_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Comum',price:0.13,base:true},
  {n:'037',dex:608,artist:"sowsow",name:"Lampent",nameJp:"ランプラー",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_35_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Incomum',price:0.08,base:true},
  {n:'038',dex:609,artist:"5ban Graphics",name:"Mega Chandelure ex",nameJp:"メガシャンデラex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_36_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Rara Dupla',price:3.90,base:true},
  {n:'039',dex:781,artist:"Oku",name:"Dhelmise",nameJp:"ダダリン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_37_R_JP_LG.png",type:'Grama',color:'#4CAF50',rare:'Incomum',price:0.10,base:true},
  {n:'040',dex:802,artist:"Nakamura Ippan",name:"Marshadow",nameJp:"マーシャドー",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_38_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Incomum',price:0.10,base:true},
  {n:'041',dex:979,artist:"Haru Akasaka",name:"Annihilape",nameJp:"コノヨザル",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_39_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Incomum',price:0.10,base:true},
  {n:'042',dex:56,artist:"Yuka Morii",name:"Mankey",nameJp:"マンキー",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_40_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Comum',price:0.13,base:true},
  {n:'043',dex:57,artist:"GOSSAN",name:"Primeape",nameJp:"オコリザル",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_41_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Comum',price:0.07,base:true},
  {n:'044',dex:408,artist:"Hideki Ishikawa",name:"Cranidos",nameJp:"ズガイドス",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_42_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Comum',price:0.10,base:true},
  {n:'045',dex:409,artist:"hncl",name:"Rampardos ex",nameJp:"ラムパルドex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_43_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Rara Dupla',price:1.99,base:true},
  {n:'046',dex:529,artist:"Atsushi Furusawa",name:"Drilbur",nameJp:"モグリュー",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_44_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Comum',price:0.10,base:true},
  {n:'047',dex:1007,artist:"kodama",name:"Koraidon",nameJp:"コライドン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_45_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Rara',price:0.18,base:true},
  {n:'048',dex:491,artist:"5ban Graphics",name:"Mega Darkrai ex",nameJp:"メガダークライex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_46_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Rara Dupla',price:5.00,base:true},
  {n:'049',dex:629,artist:"Shiburingaru",name:"Vullaby",nameJp:"バルチャイ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_47_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'050',dex:630,artist:"Nisota Niso",name:"Mandibuzz",nameJp:"バルジーナ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_48_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Comum',price:0.07,base:true},
  {n:'051',dex:686,artist:"Yuriko Akase",name:"Inkay",nameJp:"マーイーカ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_49_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Comum',price:0.09,base:true},
  {n:'052',dex:687,artist:"Naoki Saito",name:"Malamar",nameJp:"カラマネロ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_50_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Incomum',price:0.10,base:true},
  {n:'053',dex:827,artist:"Krgc",name:"Nickit",nameJp:"クスネ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_51_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Comum',price:0.09,base:true},
  {n:'054',dex:828,artist:"GOTO minori",name:"Thievul",nameJp:"フォクスライ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_52_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Incomum',price:0.13,base:true},
  {n:'055',dex:877,artist:"aky CG Works",name:"Morpeko ex",nameJp:"モルペコex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_53_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Rara Dupla',price:1.90,base:true},
  {n:'056',dex:893,artist:"matazo",name:"Zarude",nameJp:"ザルード",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_54_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Rara',price:0.19,base:true},
  {n:'057',dex:942,artist:"ryoma uratsuka",name:"Maschiff",nameJp:"オラチフ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_55_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Comum',price:0.09,base:true},
  {n:'058',dex:943,artist:"kawayoo",name:"Mabosstiff",nameJp:"マフィティフ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_56_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'059',dex:1004,artist:"IKEDA Saki",name:"Chi-Yu",nameJp:"イーユイ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_57_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Rara',price:0.18,base:true},
  {n:'060',dex:227,artist:"Anesaki Dynamic",name:"Skarmory",nameJp:"エアームド",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_58_R_JP_LG.png",type:'Metal',color:'#607D8B',rare:'Comum',price:0.10,base:true},
  {n:'061',dex:410,artist:"Kurata So",name:"Shieldon",nameJp:"タテトプス",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_59_R_JP_LG.png",type:'Metal',color:'#607D8B',rare:'Comum',price:0.15,base:true},
  {n:'062',dex:411,artist:"Kinu Nishimura",name:"Bastiodon",nameJp:"トリデプス",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_60_R_JP_LG.png",type:'Metal',color:'#607D8B',rare:'Rara',price:0.19,base:true},
  {n:'063',dex:436,artist:"Saboteri",name:"Bronzor",nameJp:"ドーミラー",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_61_R_JP_LG.png",type:'Metal',color:'#607D8B',rare:'Comum',price:0.10,base:true},
  {n:'064',dex:437,artist:"Uta",name:"Bronzong",nameJp:"ドータクン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_62_R_JP_LG.png",type:'Metal',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'065',dex:530,artist:"Keisuke Azuma",name:"Mega Excadrill ex",nameJp:"メガドリュウズex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_63_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Rara Dupla',price:3.90,base:true},
  {n:'066',dex:731,artist:"Koji Nakata",name:"Pikipek",nameJp:"ツツケラ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_64_R_JP_LG.png",type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0.12,base:true},
  {n:'067',dex:732,artist:"miki kudo",name:"Trumbeak",nameJp:"ケララッパ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_65_R_JP_LG.png",type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0.09,base:true},
  {n:'068',dex:733,artist:"Masako Tomii",name:"Toucannon",nameJp:"ドデカバシ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_66_R_JP_LG.png",type:'Incolor',color:'#9E9E9E',rare:'Incomum',price:0.15,base:true},
  {n:'069',dex:772,artist:"Ligton",name:"Tipo Nulo",nameEn:"Type: Null",nameJp:"タイプ：ヌル",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_67_R_JP_LG.png",type:'Incolor',color:'#9E9E9E',rare:'Comum',price:0.10,base:true},
  {n:'070',dex:773,artist:"Takumi Wada",name:"Silvally",nameJp:"シルヴァディ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_68_R_JP_LG.png",type:'Incolor',color:'#9E9E9E',rare:'Rara',price:0.18,base:true},
  {n:'071',dex:962,artist:"Wintr Wandr",name:"Bombirdier",nameJp:"オトシドリ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_69_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Comum',price:0.10,base:true},
  {n:'072',artist:'AYUMI ODASHIMA',name:"Fóssil Armadura Arcaico",nameEn:"Antique Armor Fossil",nameJp:"古びたたての化石",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_72_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Comum',price:0.10,base:true},
  {n:'073',artist:"AYUMI ODASHIMA",name:"Fóssil Crânio Arcaico",nameEn:"Antique Skull Fossil",nameJp:"古びたずがいの化石",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_71_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Comum',price:0.09,base:true},
  {n:'074',artist:'Toyste Beach',name:"Distintivo de Recomeço",nameEn:"Backtrack Badge",nameJp:"リトライバッジ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_74_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'075',artist:"Toyste Beach",name:"Sino Sombrio",nameEn:"Dark Bell",nameJp:"ダークベル",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_70_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.15,base:true},
  {n:'076',artist:"Oswaldo KATO",name:"Pedreira de Fóssil",nameEn:"Fossil Quarry",nameJp:"化石採掘場",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_79_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'077',artist:"akagi",name:"Batalha Decisiva do Gladio",nameEn:"Gladion's Final Battle",nameJp:"グラジオの決戦",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_76_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.15,base:true},
  {n:'078',artist:'nagimiso',name:"Clarita",nameEn:"Gwynn",nameJp:"ムク",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_78_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'079',artist:"GIDORA",name:"Jett",nameJp:"ジェット",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/MP/MP_75_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.09,base:true},
  {n:'080',artist:"En Morikura",name:"Vitalidade da Misty",nameEn:"Misty's Vitality",nameJp:"カスミの元気",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_75_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.15,base:true},
  {n:'081',artist:"Teeziro",name:"Recruta do Clã Corrosão",nameEn:"Rust Syndicate Grunt",nameJp:"サビ組のしたっぱ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_77_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.01,base:true},
  {n:'082',artist:"inose yukie",name:"Bombona",nameEn:"Tremendous Bomb",nameJp:"ごうかいボム",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_73_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Incomum',price:0.10,base:true},
  {n:'083',name:"Energia Darkness Sombria",nameEn:"Shadowy Darkness Energy",nameJp:"シャドー悪エネルギー",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_81_R_JP_LG.png",type:'Energia',color:'#212121',rare:'Rara',price:0.20,base:true},
  {n:'084',name:"Energia Lightning Voltaica",nameEn:"Voltaic Lightning Energy",nameJp:"ボルト雷エネルギー",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_80_R_JP_LG.png",type:'Energia',color:'#FFC107',rare:'Rara',price:0.28,base:true},
  // ── SECRETAS 085–120 (acima do numero de regulacao) ─────
  // CORRIGIDO 18/07/2026: estavam todas com base:true, o que faz getSlots()
  // (app.js) cair no caso padrão [N, RH] — como se cada carta secreta tivesse
  // versão Normal E Reverse Holo. Art Rare/Super Rare/Special Art Rare/Mega
  // Ultra Rare são impressão única (mesma lógica já aplicada em cards_me04.js,
  // cards_me03.js, cards_meg.js pras cartas UR/Ilustr./Gold, que usam
  // base:false). Sem essa correção o master set do ME05 pedia 2 versões de
  // 37 cartas que só existem numa versão — 74 slots fantasmas. Ver [[project_pokemon_tcg]].
  {n:'085',dex:753,artist:"Jiro Sasumo",name:"Fomantis",nameJp:"カリキリ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_82_R_JP_LG.png",type:'Grama',color:'#4CAF50',rare:'Rara Ilustrada',price:10.00,base:false},
  {n:'086',dex:936,artist:"Iwamoto05",name:"Armarouge",nameJp:"グレンアルマ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_83_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Rara Ilustrada',price:15.90,base:false},
  {n:'087',dex:118,artist:"Gemi",name:"Goldeen",nameJp:"トサキント",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_84_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Rara Ilustrada',price:39.90,base:false},
  {n:'088',dex:730,artist:"satoma",name:"Primarina",nameJp:"アシレーヌ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_85_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Rara Ilustrada',price:17.90,base:false},
  {n:'089',dex:310,artist:"HICO KIM",name:"Manectric",nameJp:"ライボルト",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_86_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada',price:9.89,base:false},
  {n:'090',dex:80,artist:"Mékayu",name:"Slowbro",nameJp:"ヤドラン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_87_R_JP_LG.png",type:'Psiquico',color:'#9C27B0',rare:'Rara Ilustrada',price:33.90,base:false},
  {n:'091',dex:781,artist:"Nakamura Ippan",name:"Dhelmise",nameJp:"ダダリン",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_88_R_JP_LG.png",type:'Grama',color:'#4CAF50',rare:'Rara Ilustrada',price:12.00,base:false},
  {n:'092',dex:828,artist:"Jerky",name:"Thievul",nameJp:"フォクスライ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_89_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Rara Ilustrada',price:6.90,base:false},
  {n:'093',dex:411,artist:"Yoriyuki Ikegami",name:"Bastiodon",nameJp:"トリデプス",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_91_R_JP_LG.png",type:'Metal',color:'#607D8B',rare:'Rara Ilustrada',price:8.90,base:false},
  {n:'094',dex:733,artist:"miki kudo",name:"Toucannon",nameJp:"ドデカバシ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_92_R_JP_LG.png",type:'Incolor',color:'#9E9E9E',rare:'Rara Ilustrada',price:11.99,base:false},
  {n:'095',dex:773,artist:"DOM",name:"Silvally",nameJp:"シルヴァディ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_93_R_JP_LG.png",type:'Incolor',color:'#9E9E9E',rare:'Rara Ilustrada',price:12.90,base:false},
  {n:'096',dex:754,artist:"5ban Graphics",name:"Lurantis ex",nameJp:"ラランテスex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_94_R_JP_LG.png",type:'Grama',color:'#4CAF50',rare:'Ultra Rara',price:10.00,base:false},
  {n:'097',dex:321,artist:"5ban Graphics",name:"Wailord ex",nameJp:"ホエルオーex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_95_R_JP_LG.png",type:'Agua',color:'#2196F3',rare:'Ultra Rara',price:12.00,base:false},
  {n:'098',dex:807,artist:'5ban Graphics',name:"Mega Zeraora ex",nameJp:"メガゼラオラex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_96_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Ultra Rara',price:19.90,base:false},
  {n:'099',dex:609,artist:'5ban Graphics',name:"Mega Chandelure ex",nameJp:"メガシャンデラex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_97_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Ultra Rara',price:24.89,base:false},
  {n:'100',dex:409,artist:'5ban Graphics',name:"Rampardos ex",nameJp:"ラムパルドex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_98_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Ultra Rara',price:8.49,base:false},
  {n:'101',dex:491,artist:'5ban Graphics',name:"Mega Darkrai ex",nameJp:"メガダークライex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_99_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Ultra Rara',price:39.90,base:false},
  {n:'102',dex:877,artist:'5ban Graphics',name:"Morpeko ex",nameJp:"モルペコex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_100_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Ultra Rara',price:9.99,base:false},
  {n:'103',dex:530,artist:"Keisuke Azuma",name:"Mega Excadrill ex",nameJp:"メガドリュウズex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_101_R_JP_LG.png",type:'Luta',color:'#FF6B35',rare:'Ultra Rara',price:29.99,base:false},
  {n:'104',artist:"Toyste Beach",name:"Bracelete Bravio",nameEn:"Brave Bangle",nameJp:"ブレイブバングル",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_107_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:20.00,base:false},
  {n:'105',artist:"Ayaka Yoshida",name:"Martelo Esmagador",nameEn:"Crushing Hammer",nameJp:"クラッシュハンマー",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_104_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:26.89,base:false},
  {n:'106',artist:"Toyste Beach",name:"Sino Sombrio",nameEn:"Dark Bell",nameJp:"ダークベル",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_105_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:6.90,base:false},
  {n:'107',artist:"Studio Bora Inc.",name:"Substituição de Energia",nameEn:"Energy Switch",nameJp:"エネルギーつけかえ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_103_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:14.00,base:false},
  {n:'108',artist:"akagi",name:"Batalha Decisiva do Gladio",nameEn:"Gladion's Final Battle",nameJp:"グラジオの決戦",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_109_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:19.90,base:false},
  {n:'109',artist:"nagimiso",name:"Clarita",nameEn:"Gwynn",nameJp:"ムク",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_111_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:43.00,base:false},
  {n:'110',artist:"Studio Bora Inc.",name:"Defensor Férreo",nameEn:"Iron Defender",nameJp:"アイアンディフェンダー",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_102_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:7.49,base:false},
  {n:'111',artist:"En Morikura",name:"Vitalidade da Misty",nameEn:"Misty's Vitality",nameJp:"カスミの元気",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_108_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:99.98,base:false},
  {n:'112',artist:"Teeziro",name:"Recruta do Clã Corrosão",nameEn:"Rust Syndicate Grunt",nameJp:"サビ組のしたっぱ",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_110_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:9.90,base:false},
  {n:'113',artist:"inose yukie",name:"Bombona",nameEn:"Tremendous Bomb",nameJp:"ごうかいボム",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_106_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Ultra Rara',price:9.90,base:false},
  {n:'114',dex:807,artist:"GIDORA",name:"Mega Zeraora ex",nameJp:"メガゼラオラex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_112_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada Especial',price:168.90,base:false},
  {n:'115',dex:609,artist:"REND",name:"Mega Chandelure ex",nameJp:"メガシャンデラex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_113_R_JP_LG.png",type:'Fogo',color:'#F44336',rare:'Rara Ilustrada Especial',price:149.90,base:false},
  {n:'116',dex:491,artist:"AKIRA EGAWA",name:"Mega Darkrai ex",nameJp:"メガダークライex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_114_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Rara Ilustrada Especial',price:619.67,base:false},
  {n:'117',dex:877,artist:"NC Empire",name:"Morpeko ex",nameJp:"モルペコex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_115_R_JP_LG.png",type:'Eletrico',color:'#FFC107',rare:'Rara Ilustrada Especial',price:165.00,base:false},
  {n:'118',artist:"DOM",name:"Batalha Decisiva do Gladio",nameEn:"Gladion's Final Battle",nameJp:"グラジオの決戦",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_116_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Rara Ilustrada Especial',price:129.79,base:false},
  {n:'119',artist:"Naoki Saito",name:"Clarita",nameEn:"Gwynn",nameJp:"ムク",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_117_R_JP_LG.png",type:'Treinador',color:'#607D8B',rare:'Rara Ilustrada Especial',price:157.00,base:false},
  {n:'120',dex:491,artist:"5ban Graphics",name:"Mega Darkrai ex Gold",nameJp:"メガダークライex",img:"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_118_R_JP_LG.png",type:'Trevas',color:'#212121',rare:'Hiper Rara Mega',price:789.99,base:false},
];
