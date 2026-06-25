// ============================================================
//  EV CALCULATOR — Metodologia 6 Passos
//  Veredicto por multiplicador: preco_pix / ev_total
// ============================================================

// --- Pull rates reais (TCGplayer, 8.500+ packs via Deck Certo) ---
var PULL_RATES = {
  'Rara':              { prob: 0.5944, label: 'Rara base (~59%)' },
  'Dupla Rara':        { prob: 1/5,   label: 'Dupla Rara (RR) 1/5' },
  'Ilustr. Rara':      { prob: 1/9,   label: 'Ilustr. Rara (IR) 1/9' },
  'Rara Ultra':        { prob: 1/12,  label: 'Rara Ultra (UR) 1/12' },
  'Ilustr. Esp. Rara': { prob: 1/83,  label: 'Ilustr. Especial (SAR) 1/83' },
  'Mega Hyper Rare':   { prob: 1/956, label: 'Mega Hiper Raro 1/956' },
  'Rara (Holo)':       { prob: 0,     label: 'Rara Holo (nao existe em ME04)' },
  'Comum':             { prob: 3.0,   label: 'Comum' },
  'Incomum':           { prob: 1.0,   label: 'Incomum' }
};

var EV_EXCLUDE = { 'Comum': true, 'Incomum': true };

function normalizeRare(r) {
  if (!r) return 'Rara';
  var s = r.trim();
  if (s === 'Dupla Rara' || s === 'Rara Dupla' || s === 'Double Rare')        return 'Dupla Rara';
  if (s === 'Ilustr. Rara' || s === 'Illustration Rare')return 'Ilustr. Rara';
  if (s === 'Rara Ultra'   || s === 'Ultra Rare')        return 'Rara Ultra';
  if (s === 'Ilustr. Esp. Rara' || s === 'Special Illustration Rare') return 'Ilustr. Esp. Rara';
  if (s === 'Mega Hyper Rare' || s === 'Hyper Rare' || s === 'Mega Attack Rare')   return 'Mega Hyper Rare';
  if (s === 'Rara (Holo)'  || s === 'Holo Rare')         return 'Rara (Holo)';
  if (s === 'Comum'        || s === 'Common')             return 'Comum';
  if (s === 'Incomum'      || s === 'Uncommon')           return 'Incomum';
  return 'Rara';
}

// calcEV: calcula EV min/avg/max a partir do banco de cartas do set
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
    var eMin = prob * minV;
    var eAvg = prob * avgV;
    var eMax = prob * maxV;
    evMin += eMin; evAvg += eAvg; evMax += eMax;
    breakdown.push({
      label: g.pr.label, prob: prob,
      minValue: minV, avgValue: avgV, maxValue: maxV,
      evMin: eMin, evAvg: eAvg, evMax: eMax,
      worstCard: prices[0], topCard: maxV, count: prices.length
    });
  });

  breakdown.sort(function(a,b){return b.evAvg-a.evAvg;});
  return { evMin: evMin, evAvg: evAvg, evMax: evMax, breakdown: breakdown };
}

// ============================================================
//  CATALOGO DE PRODUTOS
// ============================================================
// 'set': usa banco de cartas do set para calcular EV (min/avg/max)
// 'raridades': config manual com freq x valor por raridade
// ============================================================

var CATALOG = [
  // --- ME04 Caos Ascendente ---
  { id:'me04-display', grupo:'ME04 — Caos Ascendente PT-BR',
    nome:'Box Display (36 boosters)', boosters:36, varejo:539.99,
    set:'me04', extras:[], premium:0 },
  { id:'me04-etb', grupo:'ME04 — Caos Ascendente PT-BR',
    nome:'Elite Trainer Box (9 boosters)', boosters:9, varejo:199.99,
    set:'me04', extras:[{descricao:'Acessorios ETB',valor:0}], premium:5 },
  { id:'me04-blister4', grupo:'ME04 — Caos Ascendente PT-BR',
    nome:'Blister Quadruplo (4 boosters)', boosters:4, varejo:59.99,
    set:'me04', extras:[], premium:0 },
  { id:'me04-blister3', grupo:'ME04 — Caos Ascendente PT-BR',
    nome:'Blister Triplo (3 boosters)', boosters:3, varejo:44.99,
    set:'me04', extras:[], premium:0 },
  { id:'me04-booster', grupo:'ME04 — Caos Ascendente PT-BR',
    nome:'Booster Avulso', boosters:1, varejo:14.99,
    set:'me04', extras:[], premium:0 },
  // --- Outros produtos com config manual ---
  { id:'clefable-box', grupo:'Outros Produtos',
    nome:'Box Mega Luar Clefable ex (8 boosters)', boosters:8, varejo:139.90,
    raridades:[
      {nome:'Rev. Holo',  freq:1.00, valor:0.80},
      {nome:'Rara Holo',  freq:0.33, valor:4.00},
      {nome:'Dupla Rara', freq:0.20, valor:7.00},
      {nome:'IR',         freq:0.083,valor:35.00},
      {nome:'UR/SAR',     freq:0.033,valor:120.00},
      {nome:'Hyper Rare', freq:0.00056,valor:1500.00}
    ],
    extras:[{descricao:'Promo Mega Clefable ex',valor:10.00}], premium:12 },
  { id:'chary-box', grupo:'Outros Produtos',
    nome:'Box Charizard Y ex (9 boosters)', boosters:9, varejo:149.99,
    raridades:[
      {nome:'Rev. Holo',  freq:1.00, valor:0.80},
      {nome:'Rara Holo',  freq:0.33, valor:4.00},
      {nome:'Dupla Rara', freq:0.20, valor:7.00},
      {nome:'IR',         freq:0.083,valor:35.00},
      {nome:'UR/SAR',     freq:0.033,valor:120.00},
      {nome:'Hyper Rare', freq:0.00056,valor:1500.00}
    ],
    extras:[{descricao:'Promo Charizard Y ex',valor:15.00}], premium:8 },
  { id:'charx-box', grupo:'Outros Produtos',
    nome:'Box Charizard X ex (9 boosters)', boosters:9, varejo:249.99,
    raridades:[
      {nome:'Rev. Holo',  freq:1.00, valor:0.80},
      {nome:'Rara Holo',  freq:0.33, valor:4.00},
      {nome:'Dupla Rara', freq:0.20, valor:7.00},
      {nome:'IR',         freq:0.083,valor:35.00},
      {nome:'UR/SAR',     freq:0.033,valor:120.00},
      {nome:'Hyper Rare', freq:0.00056,valor:1500.00}
    ],
    extras:[{descricao:'Promo Charizard X ex',valor:25.00}], premium:10 }
];

// ============================================================
//  CLASSIFICACAO POR MULTIPLICADOR (Passo 4 da metodologia)
// ============================================================
function getVerdict(mult) {
  if (mult < 1.00) return { label:'ABAIXO DO EV', grade:'S', emoji:'', desc:'Voce paga MENOS que o EV. Rarissimo — compra imediata.', cls:'verdict-s' };
  if (mult < 1.15) return { label:'EXCELENTE',    grade:'A', emoji:'', desc:'Ate 15% acima do EV. Compra recomendada.', cls:'verdict-a' };
  if (mult < 1.35) return { label:'BOM',           grade:'B', emoji:'', desc:'Preco justo para colecionador. Vale a pena.', cls:'verdict-b' };
  if (mult < 1.55) return { label:'ACEITAVEL',     grade:'C', emoji:'', desc:'So com interesse especifico (promo, exclusivo).', cls:'verdict-c' };
  return              { label:'CARO',           grade:'D', emoji:'', desc:'Prefira comprar singles avulsos no mercado.', cls:'verdict-d' };
}

// ============================================================
//  ESTADO GLOBAL
// ============================================================
var evState = { productId: 'me04-display', pixPrice: null };

function evSelectProduct(id) {
  evState.productId = id;
  var prod = CATALOG.find(function(p){return p.id===id;}) || CATALOG[0];
  evState.pixPrice = null; // reset para varejo
  var inp = document.getElementById('ev-pix-price');
  if (inp) inp.value = prod.varejo.toFixed(2);
  renderEV();
}

function evSetPrice(v) {
  var n = parseFloat(v);
  evState.pixPrice = isNaN(n) ? null : n;
  renderEV();
}

// ============================================================
//  CALCULO DE EV POR PRODUTO
// ============================================================
function calcEVForProduct(prod) {
  var evBooster = 0;
  var evBoosterMin = 0, evBoosterMax = 0;
  var rarBreakdown = [];

  if (prod.set) {
    // Usa banco de cartas do set
    var sets = {
      me04: (typeof CARDS      !== 'undefined') ? CARDS      : [],
      me02: (typeof CARDS_ME02 !== 'undefined') ? CARDS_ME02 : [],
      meg:  (typeof CARDS_MEG  !== 'undefined') ? CARDS_MEG  : []
    };
    var cards = (sets[prod.set] || []).filter(function(c){return c.price && c.price > 0;});
    var ev = calcEV(cards);
    evBooster    = ev.evAvg;
    evBoosterMin = ev.evMin;
    evBoosterMax = ev.evMax;
    ev.breakdown.forEach(function(b){
      rarBreakdown.push({ nome: b.label, freq: b.prob, valor: b.avgValue,
        evContrib: b.evAvg, isRange: true,
        evMin: b.evMin, evMax: b.evMax, count: b.count });
    });
  } else {
    // Config manual: freq x valor
    (prod.raridades || []).forEach(function(r) {
      var contrib = r.freq * r.valor;
      evBooster += contrib;
      evBoosterMin += contrib * 0.6; // estimativa pessimista
      evBoosterMax += contrib * 1.5; // estimativa otimista
      rarBreakdown.push({ nome: r.nome, freq: r.freq, valor: r.valor, evContrib: contrib });
    });
  }

  var evBoostersTotal    = evBooster    * prod.boosters;
  var evBoostersTotalMin = evBoosterMin * prod.boosters;
  var evBoostersTotalMax = evBoosterMax * prod.boosters;

  var evExtras = (prod.extras || []).reduce(function(s,e){return s+(e.valor||0);}, 0);
  var evTotal    = evBoostersTotal    + evExtras;
  var evTotalMin = evBoostersTotalMin + evExtras;
  var evTotalMax = evBoostersTotalMax + evExtras;

  return {
    evBooster: evBooster, evBoosterMin: evBoosterMin, evBoosterMax: evBoosterMax,
    evBoostersTotal: evBoostersTotal,
    evExtras: evExtras, evTotal: evTotal,
    evTotalMin: evTotalMin, evTotalMax: evTotalMax,
    rarBreakdown: rarBreakdown
  };
}

// ============================================================
//  RENDER PRINCIPAL
// ============================================================
function renderEV() {
  var wrap = document.getElementById('ev-wrap');
  if (!wrap) return;

  var prod = CATALOG.find(function(p){return p.id===evState.productId;}) || CATALOG[0];
  var pixPrice = (evState.pixPrice !== null) ? evState.pixPrice : prod.varejo;
  var ev = calcEVForProduct(prod);
  var mult    = pixPrice / ev.evTotal;
  var lucro   = ev.evTotal - pixPrice;
  var verdict = getVerdict(mult);
  var precoAlvo = ev.evTotal * 0.85; // EV - 15% (teto de compra recomendado)

  // Opções do select agrupadas
  var grupos = {};
  CATALOG.forEach(function(p) {
    if (!grupos[p.grupo]) grupos[p.grupo] = [];
    grupos[p.grupo].push(p);
  });
  var selectHtml = '<select id="ev-product" onchange="evSelectProduct(this.value)" style="' +
    'background:var(--surface2);border:1px solid var(--border);color:var(--fg);' +
    'padding:10px 14px;border-radius:8px;font-size:14px;cursor:pointer;min-width:260px">';
  Object.keys(grupos).forEach(function(grp) {
    selectHtml += '<optgroup label="' + grp + '">';
    grupos[grp].forEach(function(p) {
      var sel = (p.id === evState.productId) ? ' selected' : '';
      selectHtml += '<option value="' + p.id + '"' + sel + '>' + p.nome + '</option>';
    });
    selectHtml += '</optgroup>';
  });
  selectHtml += '</select>';

  var verdictBg = {
    'verdict-s': 'linear-gradient(135deg,#00f5d4 0%,#00b4d8 100%)',
    'verdict-a': 'linear-gradient(135deg,#43e97b 0%,#00b4d8 100%)',
    'verdict-b': 'linear-gradient(135deg,#f9ca24 0%,#f0932b 100%)',
    'verdict-c': 'linear-gradient(135deg,#e07b39 0%,#c0392b 100%)',
    'verdict-d': 'linear-gradient(135deg,#e74c3c 0%,#8e0000 100%)'
  }[verdict.cls];

  var lucroColor = lucro >= 0 ? '#43e97b' : '#e74c3c';
  var precoAbaixoTeto = pixPrice <= precoAlvo;

  // breakdown rows
  var brkRows = '';
  ev.rarBreakdown.forEach(function(r) {
    var pct = (r.freq < 1) ? ((r.freq*100).toFixed(2)+'%') : (r.freq.toFixed(1)+'/booster');
    var contrib = fmtR(r.evContrib);
    var bar = Math.min(100, (r.evContrib / ev.evBooster * 100)).toFixed(0);
    brkRows += '<tr>' +
      '<td style="padding:8px 10px;font-size:12px;color:var(--fg)">' + r.nome + '</td>' +
      '<td style="padding:8px 10px;font-size:11px;color:var(--muted);text-align:center">' + pct + '</td>' +
      '<td style="padding:8px 10px;font-size:12px;color:var(--gold);text-align:right">' + (r.valor?fmtR(r.valor):'—') + '</td>' +
      '<td style="padding:8px 10px;text-align:right">' +
        '<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">' +
          '<div style="width:80px;background:var(--surface2);border-radius:4px;height:6px">' +
            '<div style="width:'+bar+'%;background:var(--accent);height:6px;border-radius:4px"></div>' +
          '</div>' +
          '<span style="font-size:12px;color:var(--fg);min-width:50px;text-align:right">' + contrib + '</span>' +
        '</div>' +
      '</td>' +
    '</tr>';
  });

  // extras rows
  var extrasRows = '';
  (prod.extras || []).forEach(function(e) {
    if (!e.valor) return;
    extrasRows += '<tr>' +
      '<td style="padding:6px 10px;font-size:12px;color:var(--teal)" colspan="3">+ ' + e.descricao + '</td>' +
      '<td style="padding:6px 10px;font-size:12px;color:var(--teal);text-align:right">' + fmtR(e.valor) + '</td>' +
    '</tr>';
  });

  var topoAlvo = precoAbaixoTeto
    ? '<span style="color:#43e97b">Seu preco esta ABAIXO do teto recomendado ✓</span>'
    : '<span style="color:#e74c3c">Seu preco esta ACIMA do teto — avalie bem ✗</span>';

  wrap.innerHTML =
    // ---- CONTROLES ----
    '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:24px">' +
      '<div>' +
        '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Produto</div>' +
        selectHtml +
      '</div>' +
      '<div>' +
        '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Preco Pix (R$)</div>' +
        '<input type="number" id="ev-pix-price" value="' + pixPrice.toFixed(2) + '" min="0" step="0.01"' +
        ' oninput="evSetPrice(this.value)"' +
        ' style="background:var(--surface2);border:1px solid var(--accent);color:var(--fg);' +
        'padding:10px 14px;border-radius:8px;font-size:16px;font-family:\'Bebas Neue\',sans-serif;' +
        'width:140px;letter-spacing:1px">' +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);padding-bottom:14px">' +
        'MSRP: ' + fmtR(prod.varejo) + ' &nbsp;|&nbsp; ' + prod.boosters + ' booster' + (prod.boosters>1?'s':'') +
      '</div>' +
    '</div>' +

    // ---- VEREDICTO ----
    '<div style="background:' + verdictBg + ';border-radius:16px;padding:24px 28px;' +
    'display:flex;align-items:center;gap:24px;margin-bottom:24px;flex-wrap:wrap">' +
      '<div style="background:rgba(0,0,0,0.25);border-radius:12px;width:72px;height:72px;' +
      'display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
        '<span style="font-family:\'Bebas Neue\',sans-serif;font-size:44px;color:#fff;line-height:1">' + verdict.grade + '</span>' +
      '</div>' +
      '<div style="flex:1">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:#fff;letter-spacing:2px">' +
          verdict.emoji + ' ' + verdict.label +
        '</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px">' + verdict.desc + '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:42px;color:#fff;line-height:1">' +
          mult.toFixed(2) + 'x' +
        '</div>' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase">multiplicador</div>' +
      '</div>' +
    '</div>' +

    // ---- KPIs ----
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">' +
      kpi('EV / booster', fmtR(ev.evBooster), 'var(--fg)') +
      kpi('EV total (' + prod.boosters + ' boost.)', fmtR(ev.evTotal), 'var(--fg)') +
      kpi('Voce paga', fmtR(pixPrice), 'var(--gold)') +
      kpi('Lucro esperado', (lucro>=0?'+':'')+fmtR(lucro), lucroColor) +
    '</div>' +

    // ---- TETO DE COMPRA ----
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;' +
    'padding:14px 18px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
      '<div>' +
        '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Teto de compra (EV - 15%)</div>' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;color:var(--gold)">' + fmtR(precoAlvo) + '</div>' +
      '</div>' +
      '<div style="font-size:12px;text-align:right">' + topoAlvo + '</div>' +
    '</div>' +

    // ---- BREAKDOWN ----
    '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:10px">Composicao do EV por raridade</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:24px">' +
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="background:var(--surface2);border-bottom:1px solid var(--border)">' +
          '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:left;font-weight:400">RARIDADE</th>' +
          '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:center;font-weight:400">FREQ</th>' +
          '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:right;font-weight:400">VALOR MEDIO</th>' +
          '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:right;font-weight:400">EV/BOOSTER</th>' +
        '</tr></thead>' +
        '<tbody>' + brkRows + extrasRows + '</tbody>' +
        '<tfoot><tr style="border-top:1px solid var(--border);background:var(--surface2)">' +
          '<td colspan="3" style="padding:10px;font-size:12px;color:var(--muted)">EV por booster (medio)</td>' +
          '<td style="padding:10px;font-family:\'Bebas Neue\',sans-serif;font-size:18px;color:var(--gold);text-align:right">' + fmtR(ev.evBooster) + '</td>' +
        '</tr></tfoot>' +
      '</table>' +
    '</div>' +

    // ---- NOTA ----
    '<div style="font-size:10px;color:var(--muted);line-height:1.7;padding:12px;' +
    'background:var(--surface);border-radius:8px;border-left:3px solid var(--accent)">' +
      'EV calculado com pull rates reais (TCGplayer, 8.500+ aberturas via Deck Certo). ' +
      'Bulk (Comum/Incomum) excluido — sem mercado ativo no Brasil. ' +
      'Para ME04 PT-BR, precos do bazar da Liga Pokemon. ' +
      'Teto de compra = EV - 15% (margem de segurança contra variacao de pull rates).' +
    '</div>';
}

function kpi(label, value, color) {
  return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px">' +
    '<div style="font-size:9px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + label + '</div>' +
    '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:24px;color:' + color + '">' + value + '</div>' +
  '</div>';
}

function initEV() {
  renderEV();
}
