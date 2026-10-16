// ================================================================
// MyDeck — Catálogo de produtos (produtos_catalogo.js, 17/10/2026)
// Produtos, nº de boosters e preço de tabela (varejo) usados no Preço Justo (ev_calculator.js), no Simulador
// (simulador.html), na ponte do Fichário e nos vínculos de Lojas & Ofertas (ml_search_terms.product_key = id).
// Os produtos dos sets SV são acrescentados pelo ev_calculator.js (dependem do SET_CATALOG do app.js).
// ================================================================

// ============================================================
//  CATALOGO DE PRODUTOS
// ============================================================
// Campo `premium` removido do CATALOG (jul/2026): era declarado em todo produto
// (0/5/8/12) mas nunca lido em nenhuma função deste arquivo — código morto,
// provavelmente sobra de uma feature planejada e nunca implementada. Se um dia
// fizer sentido dar bônus de EV pra ETB/caixas especiais por causa de promos
// exclusivas, é só reintroduzir com a lógica de verdade em calcEVForProduct().
var CATALOG = [
  // ── ME04 Caos Ascendente ──────────────────────────────────
  { id:'me04-display',  grupo:'ME04 — Caos Ascendente', nome:'Box Display (36 boosters)',       boosters:36, varejo:539.99, set:'me04', extras:[] },
  { id:'me04-etb',      grupo:'ME04 — Caos Ascendente', nome:'Elite Trainer Box (9 boosters)',  boosters:9,  varejo:199.99, set:'me04', extras:[] },
  { id:'me04-blister4', grupo:'ME04 — Caos Ascendente', nome:'Blister Quádruplo (4 boosters)', boosters:4,  varejo:59.99,  set:'me04', extras:[] },
  { id:'me04-blister3', grupo:'ME04 — Caos Ascendente', nome:'Blister Triplo (3 boosters)',    boosters:3,  varejo:44.99,  set:'me04', extras:[] },
  { id:'me04-blister2', grupo:'ME04 — Caos Ascendente', nome:'Blister Duplo (2 boosters)',     boosters:2,  varejo:29.99,  set:'me04', extras:[] },
  { id:'me04-booster',  grupo:'ME04 — Caos Ascendente', nome:'Booster Avulso',                 boosters:1,  varejo:14.99,  set:'me04', extras:[] },
  // ME05 — Escuridão Absoluta (lançou 17/jul/2026 — varejo ainda copiado do ME04, urgente confirmar preço real de tabela)
  { id:'me05-display',  grupo:'ME05 — Escuridão Absoluta', nome:'Box Display (36 boosters)',      boosters:36, varejo:539.99, set:'me05', extras:[], estimado:true },
  { id:'me05-etb',      grupo:'ME05 — Escuridão Absoluta', nome:'Elite Trainer Box (9 boosters)', boosters:9,  varejo:199.99, set:'me05', extras:[], estimado:true },
  { id:'me05-blister4', grupo:'ME05 — Escuridão Absoluta', nome:'Blister Quádruplo (4 boosters)',boosters:4,  varejo:59.99,  set:'me05', extras:[], estimado:true },
  { id:'me05-blister3', grupo:'ME05 — Escuridão Absoluta', nome:'Blister Triplo (3 boosters)',   boosters:3,  varejo:44.99,  set:'me05', extras:[], estimado:true },
  { id:'me05-booster',  grupo:'ME05 — Escuridão Absoluta', nome:'Booster Avulso',                boosters:1,  varejo:14.99,  set:'me05', extras:[], estimado:true },
  // ── ME03 Equilíbrio Perfeito ───────────────────────────────────
  { id:'me03-display',  grupo:'ME03 — Equilíbrio Perfeito', nome:'Box Display (36 boosters)',       boosters:36, varejo:539.99, set:'me03', extras:[] },
  { id:'me03-etb',      grupo:'ME03 — Equilíbrio Perfeito', nome:'Elite Trainer Box (9 boosters)',  boosters:9,  varejo:199.99, set:'me03', extras:[] },
  { id:'me03-blister4', grupo:'ME03 — Equilíbrio Perfeito', nome:'Blister Quádruplo (4 boosters)', boosters:4,  varejo:59.99,  set:'me03', extras:[] },
  { id:'me03-blister3', grupo:'ME03 — Equilíbrio Perfeito', nome:'Blister Triplo (3 boosters)',    boosters:3,  varejo:44.99,  set:'me03', extras:[] },
  { id:'me03-blister2', grupo:'ME03 — Equilíbrio Perfeito', nome:'Blister Duplo (2 boosters)',     boosters:2,  varejo:29.99,  set:'me03', extras:[] },
  { id:'me03-booster',  grupo:'ME03 — Equilíbrio Perfeito', nome:'Booster Avulso',                 boosters:1,  varejo:14.99,  set:'me03', extras:[] },
  // ── ME02 Fogo Fantasmagórico ──────────────────────────────
  { id:'me02-display',  grupo:'ME02 — Fogo Fantasmagórico', nome:'Box Display (36 boosters)',       boosters:36, varejo:539.99, set:'me02', extras:[] },
  { id:'me02-etb',      grupo:'ME02 — Fogo Fantasmagórico', nome:'Elite Trainer Box (9 boosters)',  boosters:9,  varejo:199.99, set:'me02', extras:[] },
  { id:'me02-blister4', grupo:'ME02 — Fogo Fantasmagórico', nome:'Blister Quádruplo (4 boosters)', boosters:4,  varejo:59.99,  set:'me02', extras:[] },
  { id:'me02-blister3', grupo:'ME02 — Fogo Fantasmagórico', nome:'Blister Triplo (3 boosters)',    boosters:3,  varejo:44.99,  set:'me02', extras:[] },
  { id:'me02-blister2', grupo:'ME02 — Fogo Fantasmagórico', nome:'Blister Duplo (2 boosters)',     boosters:2,  varejo:29.99,  set:'me02', extras:[] },
  { id:'me02-booster',  grupo:'ME02 — Fogo Fantasmagórico', nome:'Booster Avulso',                 boosters:1,  varejo:14.99,  set:'me02', extras:[] },
  // ── MEG Megaevolução ──────────────────────────────────────
  { id:'meg-display',   grupo:'MEG — Megaevolução', nome:'Box Display (36 boosters)',       boosters:36, varejo:499.99, set:'meg', extras:[] },
  { id:'meg-blister4',  grupo:'MEG — Megaevolução', nome:'Blister Quádruplo (4 boosters)', boosters:4,  varejo:54.99,  set:'meg', extras:[] },
  { id:'meg-blister3',  grupo:'MEG — Megaevolução', nome:'Blister Triplo (3 boosters)',    boosters:3,  varejo:39.99,  set:'meg', extras:[] },
  { id:'meg-booster',   grupo:'MEG — Megaevolução', nome:'Booster Avulso',                 boosters:1,  varejo:13.99,  set:'meg', extras:[] },
  // ── Caixas Especiais ──────────────────────────────────────
  // Bandas min/max destas duas caixas eram fabricadas (evBoosterMin = c*0.6, evBoosterMax = c*1.5,
  // sem base em dado nenhum). Trocado por minValor/maxValor reais por raridade (mesmo padrão dos
  // sets normais, que usam mín/máx real observado por raridade em calcEV()).
  { id:'clefable-box', grupo:'Caixas Especiais', nome:'Box Mega Luar Clefable ex (8 boost.)', boosters:8, varejo:139.90,
    raridades:[
      {nome:'Rev. Holo', freq:1.00,valor:0.80,minValor:0.50,maxValor:1.20},
      {nome:'Rara Holo',freq:0.33,valor:4.00,minValor:2.00,maxValor:8.00},
      {nome:'Dupla Rara',freq:0.12,valor:7.00,minValor:3.00,maxValor:15.00},
      {nome:'IR',freq:0.07,valor:35.00,minValor:15.00,maxValor:70.00},
      {nome:'UR/SAR',freq:0.035,valor:120.00,minValor:40.00,maxValor:300.00},
      {nome:'Hyper Rare',freq:0.0011,valor:1500.00,minValor:500.00,maxValor:3500.00}
    ], extras:[{descricao:'Promo Mega Clefable ex',valor:10.00}] },
  { id:'chary-box', grupo:'Caixas Especiais', nome:'Box Charizard Y ex (9 boost.)', boosters:9, varejo:149.99,
    raridades:[
      {nome:'Rev. Holo',freq:1.00,valor:0.80,minValor:0.50,maxValor:1.20},
      {nome:'Rara Holo',freq:0.33,valor:4.00,minValor:2.00,maxValor:8.00},
      {nome:'Dupla Rara',freq:0.12,valor:7.00,minValor:3.00,maxValor:15.00},
      {nome:'IR',freq:0.07,valor:35.00,minValor:15.00,maxValor:70.00},
      {nome:'UR/SAR',freq:0.035,valor:120.00,minValor:40.00,maxValor:300.00},
      {nome:'Hyper Rare',freq:0.0011,valor:1500.00,minValor:500.00,maxValor:3500.00}
    ], extras:[{descricao:'Promo Charizard Y ex',valor:15.00}] },
  // ── CEL30 Celebração de 30 Anos (lançou 16/set/2026) ──────────────────────────────────
  // Conteúdo e preço sugerido: pokemon.com/br (vitrine de produtos) e topdrawblog.com.br. Cada booster = 5 cartas
  // laminadas + 1 Energia Básica laminada, com 1 Pikachu ilustrada garantida. Não existe Box Display (36) neste set.
  // Promos, adesivos, moeda, fichário, capas e demais itens dos kits NÃO entram no EV (só as cartas dos boosters).
  { id:'cel30-blister2', grupo:'CEL30 — Celebração de 30 Anos', nome:'Blister Duplo com Moeda (2 boosters)',     boosters:2, varejo:69.99,  set:'cel30', model:'cel30', extras:[] },
  { id:'cel30-blister3', grupo:'CEL30 — Celebração de 30 Anos', nome:'Blister Triplo com Adesivo (3 boosters)',  boosters:3, varejo:99.99,  set:'cel30', model:'cel30', extras:[] },
  { id:'cel30-poster',   grupo:'CEL30 — Celebração de 30 Anos', nome:'Box com Pôster (3 boosters)',              boosters:3, varejo:115.99, set:'cel30', model:'cel30', extras:[] },
  { id:'cel30-exbox',    grupo:'CEL30 — Celebração de 30 Anos', nome:'Box Pokémon ex Sylveon/Greninja (4 boosters)', boosters:4, varejo:169.99, set:'cel30', model:'cel30', extras:[] },
  { id:'cel30-binder',   grupo:'CEL30 — Celebração de 30 Anos', nome:'Coleção com Fichário (5 boosters)',        boosters:5, varejo:230.99, set:'cel30', model:'cel30', extras:[] },
  { id:'cel30-figure',   grupo:'CEL30 — Celebração de 30 Anos', nome:'Box com Miniatura Mew/Mewtwo (5 boosters)', boosters:5, varejo:245.99, set:'cel30', model:'cel30', extras:[] },
  { id:'cel30-combo',    grupo:'CEL30 — Celebração de 30 Anos', nome:'Combo de Boosters (6 boosters)',           boosters:6, varejo:199.99, set:'cel30', model:'cel30', extras:[] },
  { id:'cel30-ditto',    grupo:'CEL30 — Celebração de 30 Anos', nome:'Coleção Premium Ditto (8 boosters)',       boosters:8, varejo:305.99, set:'cel30', model:'cel30', extras:[] },
  { id:'cel30-etb',      grupo:'CEL30 — Celebração de 30 Anos', nome:'Coleção Treinador Avançado (9 boosters)',  boosters:9, varejo:399.99, set:'cel30', model:'cel30', extras:[] }
];

