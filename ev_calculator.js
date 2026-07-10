// ============================================================
//  EV CALCULATOR — Metodologia 6 Passos
//  Taxas calibradas para pack BR (6 cartas: 1 energia + 4 comuns + 1 slot raro)
//  Meta: 6–11 hits por display de 36 packs
// ============================================================
var PULL_RATES = {
  'Rara':              { prob: 0.7639, label: 'Rara base (76,4%)' },
  'Dupla Rara':        { prob: 0.12,   label: 'Dupla Rara (RD) 1/8' },
  'Ilustr. Rara':      { prob: 0.07,   label: 'Ilustr. Rara (IR) 1/14' },
  'Rara Ultra':        { prob: 0.035,  label: 'Rara Ultra (UR) 1/29' },
  'Ilustr. Esp. Rara': { prob: 0.01,   label: 'Ilustr. Especial (SAR) 1/100' },
  'Mega Hyper Rare':   { prob: 1/909,  label: 'Mega Hiper Raro 1/909' },
  'Rara (Holo)':       { prob: 0,      label: 'Rara Holo (nao existe)' },
  'Comum':             { prob: 3.0,    label: 'Comum' },
  'Incomum':           { prob: 1.0,    label: 'Incomum' }
};
var EV_EXCLUDE = { 'Comum': true, 'Incomum': true };

function normalizeRare(r) {
  if (!r) return 'Rara';
  var s = r.trim();
  if (s === 'Dupla Rara' || s === 'Rara Dupla' || s === 'Double Rare') return 'Dupla Rara';
  if (s === 'Ilustr. Rara' || s === 'Illustration Rare')  return 'Ilustr. Rara';
  if (s === 'Rara Ultra' || s === 'Ultra Rare')            return 'Rara Ultra';
  if (s === 'Ilustr. Esp. Rara' || s === 'Special Illustration Rare') return 'Ilustr. Esp. Rara';
  if (s === 'Mega Hyper Rare' || s === 'Hyper Rare' || s === 'Mega Attack Rare') return 'Mega Hyper Rare';
  if (s === 'Rara (Holo)' || s === 'Holo Rare') return 'Rara (Holo)';
  if (s === 'Comum' || s === 'Common')   return 'Comum';
  if (s === 'Incomum' || s === 'Uncommon') return 'Incomum';
  return 'Rara';
}

function calcEV(cards) {
  var groups = {};
  cards.forEach(function(c) {
    if (!c.price || c.price <= 0) return;
    var r = normalizeRare(c.rare);
    if (EV_EXCLUDE[r]) return;
    var pr = PULL_RATES[r];
    if (!pr || pr.prob === 0) return;
    if (!groups[r]) groups[r] = { prices: [], pr: pr };
    groups[r].prices.push(c.price);
  });
  var evMin = 0, evAvg = 0, evMax = 0;
  var breakdown = [];
  Object.keys(groups).forEach(function(r) {
    var g = groups[r];
    var prices = g.prices.slice().sort(function(a,b){return a-b;});
    var minV = prices[0];
    var maxV = prices[prices.length-1];
    var avgV = prices.reduce(function(s,v){return s+v;},0) / prices.length;
    var prob = g.pr.prob;
    var eMin = prob*minV, eAvg = prob*avgV, eMax = prob*maxV;
    evMin+=eMin; evAvg+=eAvg; evMax+=eMax;
    breakdown.push({ label:g.pr.label, prob:prob, minValue:minV, avgValue:avgV, maxValue:maxV,
      evMin:eMin, evAvg:eAvg, evMax:eMax, count:prices.length });
  });
  breakdown.sort(function(a,b){return b.evAvg-a.evAvg;});
  return { evMin:evMin, evAvg:evAvg, evMax:evMax, breakdown:breakdown };
}

// ============================================================
//  CATALOGO DE PRODUTOS
// ============================================================
var CATALOG = [
  // ── ME04 Caos Ascendente ──────────────────────────────────
  { id:'me04-display',  grupo:'ME04 — Caos Ascendente', nome:'Box Display (36 boosters)',       boosters:36, varejo:539.99, set:'me04', extras:[], premium:0 },
  { id:'me04-etb',      grupo:'ME04 — Caos Ascendente', nome:'Elite Trainer Box (9 boosters)',  boosters:9,  varejo:199.99, set:'me04', extras:[], premium:5 },
  { id:'me04-blister4', grupo:'ME04 — Caos Ascendente', nome:'Blister Quadriplo (4 boosters)', boosters:4,  varejo:59.99,  set:'me04', extras:[], premium:0 },
  { id:'me04-blister3', grupo:'ME04 — Caos Ascendente', nome:'Blister Triplo (3 boosters)',    boosters:3,  varejo:44.99,  set:'me04', extras:[], premium:0 },
  { id:'me04-blister2', grupo:'ME04 — Caos Ascendente', nome:'Blister Duplo (2 boosters)',     boosters:2,  varejo:29.99,  set:'me04', extras:[], premium:0 },
  { id:'me04-booster',  grupo:'ME04 — Caos Ascendente', nome:'Booster Avulso',                 boosters:1,  varejo:14.99,  set:'me04', extras:[], premium:0 },
  // ME05 — Escuridão Absoluta (lança ago/2026 — varejo estimado, ajustar no lançamento)
  { id:'me05-display',  grupo:'ME05 — Escuridão Absoluta', nome:'Box Display (36 boosters)',      boosters:36, varejo:539.99, set:'me05', extras:[], premium:0 },
  { id:'me05-etb',      grupo:'ME05 — Escuridão Absoluta', nome:'Elite Trainer Box (9 boosters)', boosters:9,  varejo:199.99, set:'me05', extras:[], premium:5 },
  { id:'me05-blister4', grupo:'ME05 — Escuridão Absoluta', nome:'Blister Quadriplo (4 boosters)',boosters:4,  varejo:59.99,  set:'me05', extras:[], premium:0 },
  { id:'me05-blister3', grupo:'ME05 — Escuridão Absoluta', nome:'Blister Triplo (3 boosters)',   boosters:3,  varejo:44.99,  set:'me05', extras:[], premium:0 },
  { id:'me05-booster',  grupo:'ME05 — Escuridão Absoluta', nome:'Booster Avulso',                boosters:1,  varejo:14.99,  set:'me05', extras:[], premium:0 },
  // ── ME03 Ordem Perfeita ───────────────────────────────────
  { id:'me03-display',  grupo:'ME03 — Ordem Perfeita', nome:'Box Display (36 boosters)',       boosters:36, varejo:539.99, set:'me03', extras:[], premium:0 },
  { id:'me03-etb',      grupo:'ME03 — Ordem Perfeita', nome:'Elite Trainer Box (9 boosters)',  boosters:9,  varejo:199.99, set:'me03', extras:[], premium:5 },
  { id:'me03-blister4', grupo:'ME03 — Ordem Perfeita', nome:'Blister Quadriplo (4 boosters)', boosters:4,  varejo:59.99,  set:'me03', extras:[], premium:0 },
  { id:'me03-blister3', grupo:'ME03 — Ordem Perfeita', nome:'Blister Triplo (3 boosters)',    boosters:3,  varejo:44.99,  set:'me03', extras:[], premium:0 },
  { id:'me03-blister2', grupo:'ME03 — Ordem Perfeita', nome:'Blister Duplo (2 boosters)',     boosters:2,  varejo:29.99,  set:'me03', extras:[], premium:0 },
  { id:'me03-booster',  grupo:'ME03 — Ordem Perfeita', nome:'Booster Avulso',                 boosters:1,  varejo:14.99,  set:'me03', extras:[], premium:0 },
  // ── ME02 Fogo Fantasmagorico ──────────────────────────────
  { id:'me02-display',  grupo:'ME02 — Fogo Fantasmagorico', nome:'Box Display (36 boosters)',       boosters:36, varejo:539.99, set:'me02', extras:[], premium:0 },
  { id:'me02-etb',      grupo:'ME02 — Fogo Fantasmagorico', nome:'Elite Trainer Box (9 boosters)',  boosters:9,  varejo:199.99, set:'me02', extras:[], premium:5 },
  { id:'me02-blister4', grupo:'ME02 — Fogo Fantasmagorico', nome:'Blister Quadriplo (4 boosters)', boosters:4,  varejo:59.99,  set:'me02', extras:[], premium:0 },
  { id:'me02-blister3', grupo:'ME02 — Fogo Fantasmagorico', nome:'Blister Triplo (3 boosters)',    boosters:3,  varejo:44.99,  set:'me02', extras:[], premium:0 },
  { id:'me02-blister2', grupo:'ME02 — Fogo Fantasmagorico', nome:'Blister Duplo (2 boosters)',     boosters:2,  varejo:29.99,  set:'me02', extras:[], premium:0 },
  { id:'me02-booster',  grupo:'ME02 — Fogo Fantasmagorico', nome:'Booster Avulso',                 boosters:1,  varejo:14.99,  set:'me02', extras:[], premium:0 },
  // ── MEG Megaevolucao ──────────────────────────────────────
  { id:'meg-display',   grupo:'MEG — Megaevolucao', nome:'Box Display (36 boosters)',       boosters:36, varejo:499.99, set:'meg', extras:[], premium:0 },
  { id:'meg-blister4',  grupo:'MEG — Megaevolucao', nome:'Blister Quadriplo (4 boosters)', boosters:4,  varejo:54.99,  set:'meg', extras:[], premium:0 },
  { id:'meg-blister3',  grupo:'MEG — Megaevolucao', nome:'Blister Triplo (3 boosters)',    boosters:3,  varejo:39.99,  set:'meg', extras:[], premium:0 },
  { id:'meg-booster',   grupo:'MEG — Megaevolucao', nome:'Booster Avulso',                 boosters:1,  varejo:13.99,  set:'meg', extras:[], premium:0 },
  // ── Caixas Especiais ──────────────────────────────────────
  { id:'clefable-box', grupo:'Caixas Especiais', nome:'Box Mega Luar Clefable ex (8 boost.)', boosters:8, varejo:139.90,
    raridades:[
      {nome:'Rev. Holo', freq:1.00,valor:0.80},{nome:'Rara Holo',freq:0.33,valor:4.00},
      {nome:'Dupla Rara',freq:0.12,valor:7.00},{nome:'IR',freq:0.07,valor:35.00},
      {nome:'UR/SAR',freq:0.035,valor:120.00},{nome:'Hyper Rare',freq:0.0011,valor:1500.00}
    ], extras:[{descricao:'Promo Mega Clefable ex',valor:10.00}], premium:12 },
  { id:'chary-box', grupo:'Caixas Especiais', nome:'Box Charizard Y ex (9 boost.)', boosters:9, varejo:149.99,
    raridades:[
      {nome:'Rev. Holo',freq:1.00,valor:0.80},{nome:'Rara Holo',freq:0.33,valor:4.00},
      {nome:'Dupla Rara',freq:0.12,valor:7.00},{nome:'IR',freq:0.07,valor:35.00},
      {nome:'UR/SAR',freq:0.035,valor:120.00},{nome:'Hyper Rare',freq:0.0011,valor:1500.00}
    ], extras:[{descricao:'Promo Charizard Y ex',valor:15.00}], premium:8 }
];

// ── Sets SV (Escarlate & Violeta) — adicionados a partir do SET_CATALOG (app.js) ──
// IMPORTANTE: os precos de varejo abaixo sao ESTIMATIVAS genericas (nao ha nota
// fiscal / print de loja do Eduardo para esses sets ainda). O EV por booster usa
// dados reais (cards_svX.js via SET_CARDS_MAP), mas o "voce paga" segue estimado
// ate alguem confirmar o preco de tabela praticado. Ajustar varejo assim que
// houver referencia real de compra.
(function addSVProducts() {
  var svIds = ['sv10','sv9','sv8pt5','sv8','sv7','sv6pt5','sv6','sv5','sv4pt5','sv4','sv3pt5','sv3','sv2','sv1'];
  svIds.forEach(function(id) {
    var meta = (typeof SET_CATALOG !== 'undefined') ? SET_CATALOG.find(function(s){ return s.id === id; }) : null;
    var label = meta ? meta.label : id.toUpperCase();
    CATALOG.push(
      { id:id+'-display',  grupo:label, nome:'Box Display (36 boosters) [estimado]', boosters:36, varejo:449.99, set:id, extras:[], premium:0, estimado:true },
      { id:id+'-blister3', grupo:label, nome:'Blister Triplo (3 boosters) [estimado]', boosters:3, varejo:39.99, set:id, extras:[], premium:0, estimado:true },
      { id:id+'-booster',  grupo:label, nome:'Booster Avulso [estimado]', boosters:1, varejo:12.99, set:id, extras:[], premium:0, estimado:true }
    );
  });
})();

function getVerdict(mult) {
  if (mult < 1.00) return { label:'ABAIXO DO EV', grade:'S', cls:'verdict-s', desc:'Voce paga MENOS que o EV. Rarissimo — compra imediata.' };
  if (mult < 1.15) return { label:'EXCELENTE',    grade:'A', cls:'verdict-a', desc:'Ate 15% acima do EV. Compra recomendada.' };
  if (mult < 1.35) return { label:'BOM',           grade:'B', cls:'verdict-b', desc:'Preco justo para colecionador. Vale a pena.' };
  if (mult < 1.55) return { label:'ACEITAVEL',     grade:'C', cls:'verdict-c', desc:'So com interesse especifico (promo, exclusivo).' };
  return              { label:'CARO',           grade:'D', cls:'verdict-d', desc:'Prefira comprar singles avulsos no mercado.' };
}

var evState = { productId: 'me04-display', pixPrice: null };
var evDebounceTimer = null;

function evSelectProduct(id) {
  evState.productId = id;
  var prod = CATALOG.find(function(p){return p.id===id;}) || CATALOG[0];
  evState.pixPrice = prod.varejo;
  renderEVControls();
  renderEVResults();
}

function evSetPrice(v) {
  var n = parseFloat(v);
  evState.pixPrice = isNaN(n) ? null : n;
  clearTimeout(evDebounceTimer);
  evDebounceTimer = setTimeout(function(){ renderEVResults(); }, 350);
}

function evGetSetCards(setId) {
  // Fonte única: SET_CARDS_MAP (app.js) — mesma usada por Home, Fichário e busca global.
  // Elimina a duplicação antiga de globals (CARDS, CARDS_ME03 etc.) que travava o EV
  // calculator em apenas 5 dos 20+ sets cadastrados em SET_CATALOG.
  // NOME PREFIXADO DE PROPÓSITO: fichario_patch.js já tem uma getSetCards() global sem
  // parâmetro; como ev_calculator.js carrega DEPOIS, uma função global de mesmo nome aqui
  // sobrescrevia a do fichário e zerava o Fichário inteiro (renderBinder chamava esta versão,
  // que faz SET_CARDS_MAP[undefined] e devolve []). Ver incidente 10/07/2026 em [[feedback_coding]].
  if (typeof SET_CARDS_MAP !== 'undefined' && typeof SET_CARDS_MAP[setId] === 'function') {
    try { return SET_CARDS_MAP[setId]() || []; } catch (e) { return []; }
  }
  return [];
}

function calcEVForProduct(prod) {
  var evBooster = 0, evBoosterMin = 0, evBoosterMax = 0;
  var rarBreakdown = [];
  if (prod.set) {
    var cards = evGetSetCards(prod.set).filter(function(c){return c.price && c.price > 0;});
    if (cards.length === 0) {
      return { evBooster:0, evBoosterMin:0, evBoosterMax:0, evBoostersTotal:0,
               evExtras:0, evTotal:0, evTotalMin:0, evTotalMax:0, rarBreakdown:[], noData:true };
    }
    var ev = calcEV(cards);
    evBooster = ev.evAvg; evBoosterMin = ev.evMin; evBoosterMax = ev.evMax;
    ev.breakdown.forEach(function(b){
      rarBreakdown.push({ nome:b.label, freq:b.prob, valor:b.avgValue, evContrib:b.evAvg });
    });
  } else {
    (prod.raridades||[]).forEach(function(r){
      var c = r.freq * r.valor;
      evBooster += c; evBoosterMin += c*0.6; evBoosterMax += c*1.5;
      rarBreakdown.push({ nome:r.nome, freq:r.freq, valor:r.valor, evContrib:c });
    });
  }
  var evBoostersTotal = evBooster * prod.boosters;
  var evExtras = (prod.extras||[]).reduce(function(s,e){return s+(e.valor||0);},0);
  var evTotal = evBoostersTotal + evExtras;
  return { evBooster:evBooster, evBoosterMin:evBoosterMin, evBoosterMax:evBoosterMax,
           evBoostersTotal:evBoostersTotal, evExtras:evExtras, evTotal:evTotal,
           evTotalMin:evBoosterMin*prod.boosters+evExtras,
           evTotalMax:evBoosterMax*prod.boosters+evExtras,
           rarBreakdown:rarBreakdown, noData:false };
}

function kpi(label, value, color) {
  return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px">' +
    '<div style="font-size:9px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + label + '</div>' +
    '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:24px;color:' + color + '">' + value + '</div>' +
  '</div>';
}

function renderEVControls() {
  var area = document.getElementById('ev-ctrl');
  if (!area) return;
  var prod = CATALOG.find(function(p){return p.id===evState.productId;}) || CATALOG[0];
  var pixPrice = evState.pixPrice !== null ? evState.pixPrice : prod.varejo;

  var grupos = {};
  CATALOG.forEach(function(p){ if(!grupos[p.grupo]) grupos[p.grupo]=[]; grupos[p.grupo].push(p); });
  var sel = '<select id="ev-product" onchange="evSelectProduct(this.value)" style="' +
    'background:var(--surface2);border:1px solid var(--border);color:var(--fg);' +
    'padding:10px 14px;border-radius:8px;font-size:14px;cursor:pointer;min-width:260px">';
  Object.keys(grupos).forEach(function(grp){
    sel += '<optgroup label="' + grp + '">';
    grupos[grp].forEach(function(p){
      sel += '<option value="' + p.id + '"' + (p.id===evState.productId?' selected':'') + '>' + p.nome + '</option>';
    });
    sel += '</optgroup>';
  });
  sel += '</select>';

  area.innerHTML =
    '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:24px">' +
      '<div>' +
        '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Produto</div>' +
        sel +
      '</div>' +
      '<div>' +
        '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Preco Pix (R$)</div>' +
        '<input type="number" id="ev-pix-price" value="' + pixPrice.toFixed(2) + '" min="0" step="0.01"' +
        ' oninput="evSetPrice(this.value)"' +
        ' style="background:var(--surface2);border:1px solid var(--accent);color:var(--fg);' +
        'padding:10px 14px;border-radius:8px;font-size:16px;font-family:\'Bebas Neue\',sans-serif;width:140px;letter-spacing:1px">' +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);padding-bottom:14px">' +
        'MSRP: ' + fmtR(prod.varejo) + ' &nbsp;|&nbsp; ' + prod.boosters + ' booster' + (prod.boosters>1?'s':'') +
      '</div>' +
    '</div>';
}

function renderEVResults() {
  var area = document.getElementById('ev-res');
  if (!area) return;
  var prod = CATALOG.find(function(p){return p.id===evState.productId;}) || CATALOG[0];
  var inp = document.getElementById('ev-pix-price');
  var pixPrice = inp ? parseFloat(inp.value)||prod.varejo : (evState.pixPrice!==null?evState.pixPrice:prod.varejo);
  var ev = calcEVForProduct(prod);

  if (ev.noData) {
    area.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;' +
      'padding:32px;text-align:center;color:var(--muted)">' +
      '<div style="font-size:32px;margin-bottom:12px">🚧</div>' +
      '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:20px;letter-spacing:2px;margin-bottom:8px">Banco de dados em construcao</div>' +
      '<div style="font-size:12px">Os precos das cartas deste set ainda nao foram cadastrados.<br>' +
      'Adicione os cards ao arquivo correspondente para habilitar o calculo de EV.</div></div>';
    return;
  }

  var mult = ev.evTotal > 0 ? pixPrice / ev.evTotal : 0;
  var lucro = ev.evTotal - pixPrice;
  var verdict = getVerdict(mult);
  var precoAlvo = ev.evTotal * 0.85;
  var precoAbaixoTeto = pixPrice <= precoAlvo;

  var verdictBg = {
    'verdict-s':'linear-gradient(135deg,#00f5d4 0%,#00b4d8 100%)',
    'verdict-a':'linear-gradient(135deg,#43e97b 0%,#00b4d8 100%)',
    'verdict-b':'linear-gradient(135deg,#f9ca24 0%,#f0932b 100%)',
    'verdict-c':'linear-gradient(135deg,#e07b39 0%,#c0392b 100%)',
    'verdict-d':'linear-gradient(135deg,#e74c3c 0%,#8e0000 100%)'
  }[verdict.cls];

  var lucroColor = lucro >= 0 ? '#43e97b' : '#e74c3c';
  var topoAlvo = precoAbaixoTeto
    ? '<span style="color:#43e97b">Abaixo do teto recomendado ✓</span>'
    : '<span style="color:#e74c3c">Acima do teto — avalie bem ✗</span>';

  var brkRows = '';
  ev.rarBreakdown.forEach(function(r){
    var pct = (r.freq<1) ? (r.freq*100).toFixed(2)+'%' : r.freq.toFixed(1)+'/boost';
    var bar = Math.min(100,(ev.evBooster>0?(r.evContrib/ev.evBooster*100):0)).toFixed(0);
    brkRows += '<tr>' +
      '<td style="padding:8px 10px;font-size:12px;color:var(--fg)">' + r.nome + '</td>' +
      '<td style="padding:8px 10px;font-size:11px;color:var(--muted);text-align:center">' + pct + '</td>' +
      '<td style="padding:8px 10px;font-size:12px;color:var(--gold);text-align:right">' + (r.valor?fmtR(r.valor):'—') + '</td>' +
      '<td style="padding:8px 10px;text-align:right">' +
        '<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">' +
          '<div style="width:80px;background:var(--surface2);border-radius:4px;height:6px">' +
            '<div style="width:'+bar+'%;background:var(--accent);height:6px;border-radius:4px"></div>' +
          '</div>' +
          '<span style="font-size:12px;color:var(--fg);min-width:50px;text-align:right">' + fmtR(r.evContrib) + '</span>' +
        '</div>' +
      '</td></tr>';
  });
  (prod.extras||[]).forEach(function(e){
    if(!e.valor) return;
    brkRows += '<tr><td colspan="3" style="padding:6px 10px;font-size:12px;color:var(--teal)">+ ' + e.descricao + '</td>' +
      '<td style="padding:6px 10px;font-size:12px;color:var(--teal);text-align:right">' + fmtR(e.valor) + '</td></tr>';
  });

  var estimadoBanner = prod.estimado ? (
    '<div style="background:rgba(247,183,49,.12);border:1px solid var(--gold);border-radius:8px;' +
    'padding:10px 14px;margin-bottom:16px;font-size:11px;color:var(--gold)">' +
    '⚠ Preco de varejo estimado — ainda sem referencia real de compra para este set. O EV/booster usa dados reais de mercado.' +
    '</div>'
  ) : '';

  area.innerHTML = estimadoBanner +
    '<div style="background:' + verdictBg + ';border-radius:16px;padding:24px 28px;' +
    'display:flex;align-items:center;gap:24px;margin-bottom:24px;flex-wrap:wrap">' +
      '<div style="background:rgba(0,0,0,0.25);border-radius:12px;width:72px;height:72px;' +
      'display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
        '<span style="font-family:\'Bebas Neue\',sans-serif;font-size:44px;color:#fff;line-height:1">' + verdict.grade + '</span>' +
      '</div>' +
      '<div style="flex:1">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:#fff;letter-spacing:2px">' + verdict.label + '</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px">' + verdict.desc + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:42px;color:#fff;line-height:1">' + mult.toFixed(2) + 'x</div>' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase">multiplicador</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">' +
      kpi('EV / booster', fmtR(ev.evBooster), 'var(--fg)') +
      kpi('EV total (' + prod.boosters + 'x)', fmtR(ev.evTotal), 'var(--fg)') +
      kpi('Voce paga', fmtR(pixPrice), 'var(--gold)') +
      kpi('Lucro esperado', (lucro>=0?'+':'') + fmtR(lucro), lucroColor) +
    '</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;' +
    'padding:14px 18px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
      '<div><div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Teto de compra (EV - 15%)</div>' +
      '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;color:var(--gold)">' + fmtR(precoAlvo) + '</div></div>' +
      '<div style="font-size:12px">' + topoAlvo + '</div>' +
    '</div>' +
    '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:10px">Composicao do EV por raridade</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:24px">' +
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="background:var(--surface2);border-bottom:1px solid var(--border)">' +
          '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:left;font-weight:400">RARIDADE</th>' +
          '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:center;font-weight:400">FREQ</th>' +
          '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:right;font-weight:400">VALOR MEDIO</th>' +
          '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:right;font-weight:400">EV/BOOSTER</th>' +
        '</tr></thead>' +
        '<tbody>' + brkRows + '</tbody>' +
        '<tfoot><tr style="border-top:1px solid var(--border);background:var(--surface2)">' +
          '<td colspan="3" style="padding:10px;font-size:12px;color:var(--muted)">EV por booster (medio)</td>' +
          '<td style="padding:10px;font-family:\'Bebas Neue\',sans-serif;font-size:18px;color:var(--gold);text-align:right">' + fmtR(ev.evBooster) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
    '</div>' +
    '<div style="font-size:10px;color:var(--muted);line-height:1.7;padding:12px;background:var(--surface);border-radius:8px;border-left:3px solid var(--accent)">' +
      'Pack BR: 6 cartas (1 energia + 4 comuns + 1 slot raro). Taxas calibradas para 6–11 hits por display · Teto = EV - 15% (margem de seguranca). Bulk excluido do calculo.' +
    '</div>';
}

function renderEV() {
  var wrap = document.getElementById('ev-wrap');
  if (!wrap) return;
  if (!document.getElementById('ev-ctrl')) {
    wrap.innerHTML = '<div id="ev-ctrl"></div><div id="ev-res"></div>';
  }
  renderEVControls();
  renderEVResults();
}

function initEV() { renderEV(); }
