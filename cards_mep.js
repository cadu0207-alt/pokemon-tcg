// MEP — Black Star Promos (Parceiros Iniciais / First Partner Illustration Collection)
// Série 1: MEP037–MEP045 (Kanto, Sinnoh, Alola) — lançamento 30/03/2026
// Série 2: MEP046–MEP054 (Johto, Unova, Galar)  — lançamento 19/06/2026
// Categoria: Promos exclusivos, não pertencem a nenhum set regular
// Preços: estimativas de mercado BR (jun/2026) — set completo S1 ~R$700 no MYP Cards
const CARDS_MEP = [
  // SÉRIE 1 — Kanto (MEP037–039)
  // Charmander > Bulbasaur > Squirtle em popularidade; referência USD: ~$44/$37/$34
  {n:'037',name:'Bulbasaur',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:160.00,base:true,important:true,series:'Série 1 — Kanto'},
  {n:'038',name:'Charmander',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:190.00,base:true,important:true,series:'Série 1 — Kanto'},
  {n:'039',name:'Squirtle',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:145.00,base:true,important:true,series:'Série 1 — Kanto'},
  // SÉRIE 1 — Sinnoh (MEP040–042)
  // Piplup > Chimchar > Turtwig; Piplup tem maior fanbase
  {n:'040',name:'Turtwig',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:35.00,base:true,series:'Série 1 — Sinnoh'},
  {n:'041',name:'Chimchar',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:45.00,base:true,series:'Série 1 — Sinnoh'},
  {n:'042',name:'Piplup',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:75.00,base:true,important:true,series:'Série 1 — Sinnoh'},
  // SÉRIE 1 — Alola (MEP043–045)
  // Os três têm demanda similar; Rowlet levemente à frente
  {n:'043',name:'Rowlet',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:40.00,base:true,series:'Série 1 — Alola'},
  {n:'044',name:'Litten',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:35.00,base:true,series:'Série 1 — Alola'},
  {n:'045',name:'Popplio',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:30.00,base:true,series:'Série 1 — Alola'},
  // SÉRIE 2 — Johto (MEP046–048) — lançamento 19/06/2026, 1 semana no mercado
  // Johto = mais procurado da S2; Cyndaquil/Totodile lideram; preços ainda voláteis
  {n:'046',name:'Chikorita',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:50.00,base:true,series:'Série 2 — Johto'},
  {n:'047',name:'Cyndaquil',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:80.00,base:true,important:true,series:'Série 2 — Johto'},
  {n:'048',name:'Totodile',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:70.00,base:true,series:'Série 2 — Johto'},
  // SÉRIE 2 — Unova (MEP049–051)
  // Snivy e Oshawott têm fanbases fortes; Gen 5 em alta; Tepig menor demanda
  {n:'049',name:'Snivy',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:45.00,base:true,series:'Série 2 — Unova'},
  {n:'050',name:'Tepig',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:35.00,base:true,series:'Série 2 — Unova'},
  {n:'051',name:'Oshawott',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:48.00,base:true,series:'Série 2 — Unova'},
  // SÉRIE 2 — Galar (MEP052–054)
  // Menos nostalgia; Sobble tem maior seguimento individual; os três são os mais baratos da S2
  {n:'052',name:'Grookey',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:28.00,base:true,series:'Série 2 — Galar'},
  {n:'053',name:'Scorbunny',type:'Fogo',color:'#F44336',rare:'Ilustração Rara (IR)',price:28.00,base:true,series:'Série 2 — Galar'},
  {n:'054',name:'Sobble',type:'Aquático',color:'#2196F3',rare:'Ilustração Rara (IR)',price:35.00,base:true,series:'Série 2 — Galar'},
  // Snover (veio na Coleção Parceiros Iniciais junto com ME02/MEG boosters)
  {n:'140',name:'Snover',type:'Grama',color:'#4CAF50',rare:'Ilustração Rara (IR)',price:8.00,base:false,series:'MEG Secretas'},
];
