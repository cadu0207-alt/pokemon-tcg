// ============================================================
//  EV CALCULATOR — Metodologia 6 Passos
//  Taxas calibradas para pack BR (6 cartas: 1 energia + 4 comuns + 1 slot raro)
//  Meta: 6–11 hits por display de 36 packs
//
//  PULL_RATES, EV_EXCLUDE e normalizeRare() agora moram em pull_rates.js
//  (carregado antes deste arquivo) — é a mesma fonte usada pelo Simulador,
//  pra evitar as duas telas divergirem de novo. Ver esse arquivo pro
//  histórico do incidente que motivou a unificação.
// ============================================================

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

// CATALOG (produtos, boosters e preço de tabela) agora mora em produtos_catalogo.js (17/10/2026), compartilhado com o
// Simulador. Os produtos dos sets SV continuam sendo acrescentados logo abaixo (dependem do SET_CATALOG do app.js).

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
      { id:id+'-display',  grupo:label, nome:'Box Display (36 boosters) [estimado]', boosters:36, varejo:449.99, set:id, extras:[], estimado:true },
      { id:id+'-blister3', grupo:label, nome:'Blister Triplo (3 boosters) [estimado]', boosters:3, varejo:39.99, set:id, extras:[], estimado:true },
      { id:id+'-booster',  grupo:label, nome:'Booster Avulso [estimado]', boosters:1, varejo:12.99, set:id, extras:[], estimado:true }
    );
  });
})();

function getVerdict(mult) {
  if (mult < 1.00) return { label:'ABAIXO DO EV', grade:'S', cls:'verdict-s', desc:'Você paga MENOS que o EV. Raríssimo — compra imediata.' };
  if (mult < 1.15) return { label:'EXCELENTE',    grade:'A', cls:'verdict-a', desc:'Até 15% acima do EV. Compra recomendada.' };
  if (mult < 1.35) return { label:'BOM',           grade:'B', cls:'verdict-b', desc:'Preco justo para colecionador. Vale a pena.' };
  if (mult < 1.55) return { label:'ACEITÁVEL',     grade:'C', cls:'verdict-c', desc:'Só com interesse específico (promo, exclusivo).' };
  return              { label:'CARO',           grade:'D', cls:'verdict-d', desc:'Prefira comprar singles avulsos no mercado.' };
}

var evState = { productId: 'me04-display', pixPrice: null };
var evDebounceTimer = null;

var evRealPriceInfo = null; // {price, updatedAt} do produto atual, ou null se nao rastreado

async function evApplyRealPrice(id) {
  if (typeof window.mydeckGetRealPrice !== 'function') return;
  var real = null;
  try { real = await window.mydeckGetRealPrice(id); } catch (e) { real = null; }
  if (evState.productId !== id) return; // usuario ja trocou de produto nesse meio tempo
  evRealPriceInfo = real;
  if (real) evState.pixPrice = real.price;
  renderEVControls();
  renderEVResults();
}

function evSelectProduct(id) {
  evState.productId = id;
  var prod = CATALOG.find(function(p){return p.id===id;}) || CATALOG[0];
  evState.pixPrice = prod.varejo;
  evRealPriceInfo = null;
  renderEVControls();
  renderEVResults();
  evApplyRealPrice(id); // busca assincrona — atualiza quando (se) responder
  if (typeof evRenderRanking === 'function') evRenderRanking(); // só atualiza a linha destacada (preços já em cache)
}

function evSetPrice(v) {
  var n = parseFloat(v);
  // Clamp >= 0 (auditoria 03/08/2026): preço negativo gerava nota "S — compra
  // imediata" com lucro absurdo. Negativo agora vira null (= "informe o preço").
  if (isNaN(n) || n < 0) n = null;
  evState.pixPrice = n;
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

// Taxas e classificação do pacote da Celebração de 30 Anos (CEL30_RATES, cel30Classify) agora vivem em pull_rates.js,
// fonte única usada também pelo Simulador.
function cel30Pools() {
  var cards = evGetSetCards('cel30').filter(function(c){ return c.price && c.price > 0; });
  var pools = [];
  CEL30_RATES.forEach(function(r) {
    var prices = cards.filter(function(c){ return cel30Classify(c) === r.key; }).map(function(c){ return c.price; });
    if (prices.length) pools.push({ key:r.key, nome:r.nome, freq:r.freq, prices:prices });
  });
  return pools;
}

function calcEVForProduct(prod) {
  var evBooster = 0, evBoosterMin = 0, evBoosterMax = 0;
  var rarBreakdown = [];
  if (prod.model === 'cel30') {
    var cpools = cel30Pools();
    if (!cpools.length) {
      return { evBooster:0, evBoosterMin:0, evBoosterMax:0, evBoostersTotal:0,
               evExtras:0, evTotal:0, evTotalMin:0, evTotalMax:0, rarBreakdown:[], noData:true };
    }
    cpools.forEach(function(pl) {
      var mean = pl.prices.reduce(function(a, v){ return a + v; }, 0) / pl.prices.length;
      var c = pl.freq * mean;
      evBooster += c;
      evBoosterMin += pl.freq * Math.min.apply(null, pl.prices);
      evBoosterMax += pl.freq * Math.max.apply(null, pl.prices);
      rarBreakdown.push({ nome:pl.nome, freq:pl.freq, valor:mean, evContrib:c, key:pl.key });
    });
  } else if (prod.set) {
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
      // minValor/maxValor vem do próprio cadastro do produto (faixa real de preço
      // observada pra essa raridade nessas caixas especiais) — antes era um fator
      // arbitrário (c*0.6 / c*1.5) sem base em dado nenhum, igual pros sets normais
      // (calcEV() acima usa mín/máx real por raridade) e pra estas caixas.
      var minV = (r.minValor != null) ? r.minValor : r.valor;
      var maxV = (r.maxValor != null) ? r.maxValor : r.valor;
      evBooster += c; evBoosterMin += r.freq*minV; evBoosterMax += r.freq*maxV;
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

// ============================================================
//  SIMULAÇÃO — chance de recuperar o valor pago (pacote 2, 17/10/2026)
// ============================================================
// O EV é uma MÉDIA; quem compra 1 display de 36 boosters quer saber também "qual a chance de eu sair no zero a zero?".
// Simula 20.000 aberturas do produto com as mesmas taxas (PULL_RATES) e os mesmos preços de carta do EV: cada booster
// tem 1 slot raro (sorteia a raridade pela taxa e depois uma carta daquela raridade); comuns/incomuns não valem nada
// (bulk fora do cálculo, igual ao EV). Caixas especiais usam a frequência por raridade do próprio cadastro. O resultado
// é guardado por produto (a distribuição não depende do preço digitado) e usa semente fixa: os números não "mexem" a
// cada re-render.
var EV_SIM_TRIALS = 20000;
var EV_SELL_FEE = 0.15; // taxa média de venda (ML + frete) — só pra mostrar o retorno "se revender"
var evSimCache = {};

function evHashStr(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function evRng(seed) {
  return function() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function evSimulate(prod) {
  if (evSimCache[prod.id]) return evSimCache[prod.id];
  var rnd = evRng(evHashStr(prod.id));
  var pools = [], rows = [], indep = [];
  if (prod.model === 'cel30') {
    indep = cel30Pools();
    if (!indep.length) return null;
  } else if (prod.set) {
    var groups = {};
    evGetSetCards(prod.set).forEach(function(c) {
      if (!c.price || c.price <= 0) return;
      var r = normalizeRare(c.rare);
      if (EV_EXCLUDE[r]) return;
      var pr = PULL_RATES[r];
      if (!pr || pr.prob === 0) return;
      if (!groups[r]) groups[r] = { prob: pr.prob, prices: [] };
      groups[r].prices.push(c.price);
    });
    Object.keys(groups).forEach(function(k) { pools.push(groups[k]); });
    if (!pools.length) return null;
  } else {
    rows = (prod.raridades || []).map(function(r) { return { freq: r.freq, valor: r.valor }; });
    if (!rows.length) return null;
  }
  var extras = (prod.extras || []).reduce(function(a, e) { return a + (e.valor || 0); }, 0);
  var totals = new Float64Array(EV_SIM_TRIALS);
  for (var t = 0; t < EV_SIM_TRIALS; t++) {
    var sum = extras;
    for (var b = 0; b < prod.boosters; b++) {
      if (indep.length) {
        // Celebração 30 Anos: cada raridade é um sorteio independente por pacote (a Pikachu é garantida: freq 1)
        for (var q = 0; q < indep.length; q++) {
          var nq = Math.floor(indep[q].freq);
          if (rnd() < indep[q].freq - nq) nq++;
          for (var w = 0; w < nq; w++) sum += indep[q].prices[Math.floor(rnd() * indep[q].prices.length)];
        }
      } else if (pools.length) {
        var u = rnd(), acc = 0;
        for (var i = 0; i < pools.length; i++) {
          acc += pools[i].prob;
          if (u < acc) { sum += pools[i].prices[Math.floor(rnd() * pools[i].prices.length)]; break; }
        }
      } else {
        for (var j = 0; j < rows.length; j++) {
          var n = Math.floor(rows[j].freq);
          if (rnd() < rows[j].freq - n) n++;
          sum += n * rows[j].valor;
        }
      }
    }
    totals[t] = sum;
  }
  totals.sort();
  evSimCache[prod.id] = totals;
  return totals;
}
// fração das aberturas simuladas que rendeu pelo menos `price`
function evSimChance(totals, price) {
  var lo = 0, hi = totals.length;
  while (lo < hi) { var mid = (lo + hi) >> 1; if (totals[mid] < price) lo = mid + 1; else hi = mid; }
  return (totals.length - lo) / totals.length;
}
function evSimPct(totals, q) { return totals[Math.min(totals.length - 1, Math.floor(q * totals.length))]; }

// ============================================================
//  RANKING "ONDE VALE MAIS COMPRAR" (pacote 2)
// ============================================================
var evRankCache = null; // { real: {product_key:{price,updatedAt}} }
function evHasDataFor(p) {
  if (!p.set) return true;
  return evGetSetCards(p.set).some(function(c) { return c.price && c.price > 0; });
}
async function evRenderRanking() {
  var box = document.getElementById('ev-rank');
  if (!box) return;
  if (!evRankCache) {
    var real = {};
    try { if (typeof window.mydeckGetAllRealPrices === 'function') real = await window.mydeckGetAllRealPrices(); } catch (e) { real = {}; }
    evRankCache = { real: real };
    box = document.getElementById('ev-rank');
    if (!box) return;
  }
  var rows = [];
  CATALOG.forEach(function(p) {
    if (!evHasDataFor(p)) return;
    var ev = calcEVForProduct(p);
    if (ev.noData || !(ev.evTotal > 0)) return;
    var real = evRankCache.real[p.id];
    var price = real ? real.price : p.varejo;
    rows.push({ p: p, price: price, isReal: !!real, ret: ev.evTotal / price * 100 });
  });
  rows.sort(function(a, b) { return b.ret - a.ret; });
  var body = rows.map(function(r) {
    var v = getVerdict(100 / r.ret);
    var origem = r.isReal ? '<span style="color:#16a34a">ML · 7 dias</span>' : '<span style="color:var(--muted)">' + (r.p.estimado ? '⚠ tabela estimada' : 'preço de tabela') + '</span>';
    if (r.p.model === 'cel30') origem += '<br><span style="color:var(--gold)">⚠ taxas de pull não oficiais</span>';
    var sel = r.p.id === evState.productId;
    return '<tr onclick="evPickFromRanking(\'' + r.p.id + '\')" style="cursor:pointer;border-top:1px solid var(--border);' + (sel ? 'background:var(--surface2)' : '') + '">' +
      '<td style="padding:8px 10px;font-size:12px">' + r.p.nome.replace(/ \[estimado\]/, '') + '<div style="font-size:10px;color:var(--muted)">' + r.p.grupo + '</div></td>' +
      '<td style="padding:8px 10px;font-size:12px;text-align:right;color:var(--gold);white-space:nowrap">R$' + fmtR(r.price) + '<div style="font-size:9px">' + origem + '</div></td>' +
      '<td style="padding:8px 10px;font-family:\'Bebas Neue\',sans-serif;font-size:20px;text-align:right;white-space:nowrap">' + Math.round(r.ret) + '%</td>' +
      '<td style="padding:8px 10px;text-align:center"><span style="font-family:\'Bebas Neue\',sans-serif;font-size:16px">' + v.grade + '</span></td></tr>';
  }).join('');
  box.innerHTML =
    '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin:28px 0 6px">🏆 Onde vale mais comprar hoje</div>' +
    '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Todos os produtos com preços de carta cadastrados, do maior para o menor retorno esperado. O preço usado é o menor achado no ML nos últimos 7 dias, quando o produto é monitorado; nos demais, o preço de tabela. Toque numa linha pra ver o detalhe.</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;max-height:420px;overflow-y:auto">' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--surface2)">' +
        '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:left;font-weight:400">PRODUTO</th>' +
        '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:right;font-weight:400">PREÇO</th>' +
        '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:right;font-weight:400">RETORNO</th>' +
        '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:center;font-weight:400">NOTA</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
}
// ============================================================
//  PREÇO vs SUGERIDO — Celebração 30 Anos (e qualquer coleção com preço oficial cadastrado)
// ============================================================
// A Celebração 30 Anos é um set comemorativo (reimpressões da Coleção Clássica, 3 Mews RGB…) e a composição dos
// produtos (boosters por caixa, raridade por pacote) ainda não está cadastrada — então NÃO dá pra calcular EV. O que
// já dá é comparar o preço do ML com o preço sugerido pela Copag (ml_search_terms.msrp): quanto de ágio o mercado cobra.
var evMsrpCache = null;
async function evRenderMsrp() {
  var box = document.getElementById('ev-msrp');
  if (!box) return;
  if (!evMsrpCache) {
    try { evMsrpCache = (typeof window.mydeckGetMsrpProducts === 'function') ? await window.mydeckGetMsrpProducts() : []; } catch (e) { evMsrpCache = []; }
    box = document.getElementById('ev-msrp');
    if (!box) return;
  }
  var rows = evMsrpCache.filter(function(r) { return r.price && +r.term.msrp > 0; }).map(function(r) {
    var msrp = +r.term.msrp, price = r.price.price;
    return { t: r.term, p: r.price, msrp: msrp, price: price, pct: (price - msrp) / msrp * 100 };
  });
  if (!rows.length) { box.innerHTML = ''; return; }
  var tol = (typeof MSRP_TOLERANCE === 'number' ? MSRP_TOLERANCE : 0.10) * 100;
  function nome(t) {
    var n = (t.label && t.label.trim()) || t.term || '';
    return n.length > 64 ? n.slice(0, 61) + '…' : n;
  }
  var body = rows.map(function(r) {
    var cor = r.pct <= tol ? '#16a34a' : (r.pct <= 30 ? 'var(--gold)' : '#e74c3c');
    var sel = r.pct <= tol ? '🎯 preço de tabela' : (r.pct <= 30 ? 'ágio moderado' : 'ágio alto');
    var href = r.p.url ? String(r.p.url).replace(/"/g, '%22') : null;
    return '<tr style="border-top:1px solid var(--border)">' +
      '<td style="padding:8px 10px;font-size:12px">' + esc(nome(r.t)) + '</td>' +
      '<td style="padding:8px 10px;font-size:12px;text-align:right;white-space:nowrap">R$' + fmtR(r.msrp) + '</td>' +
      '<td style="padding:8px 10px;font-size:12px;text-align:right;color:var(--gold);white-space:nowrap">R$' + fmtR(r.price) + '</td>' +
      '<td style="padding:8px 10px;text-align:right;white-space:nowrap;color:' + cor + '"><span style="font-family:\'Bebas Neue\',sans-serif;font-size:18px">' + (r.pct >= 0 ? '+' : '') + Math.round(r.pct) + '%</span><div style="font-size:9px">' + sel + '</div></td>' +
      '<td style="padding:8px 10px;text-align:center">' + (href ? '<a href="' + href + '" target="_blank" rel="noopener sponsored" title="Ver no Mercado Livre" style="text-decoration:none">↗</a>' : '') + '</td></tr>';
  }).join('');
  var anyAff = rows.some(function(r) { return r.p.affiliate; });
  box.innerHTML =
    '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin:28px 0 6px">🎉 Celebração 30 Anos — preço no ML × sugerido Copag</div>' +
    '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">Lançamento em 16/09/2026. O EV desses produtos está na calculadora acima (grupo CEL30), com taxas de pull da comunidade — não oficiais. Aqui aparece quanto o Mercado Livre cobra acima do preço sugerido pela Copag — menor preço dos últimos 7 dias.</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow-x:auto">' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--surface2)">' +
        '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:left;font-weight:400">PRODUTO</th>' +
        '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:right;font-weight:400">SUGERIDO</th>' +
        '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:right;font-weight:400">ML HOJE</th>' +
        '<th style="padding:8px 10px;font-size:9px;letter-spacing:2px;color:var(--muted);text-align:right;font-weight:400">ÁGIO</th>' +
        '<th style="padding:8px 10px"></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>' +
    (anyAff ? '<div style="font-size:10px;color:var(--muted);margin-top:6px">🔗 Os links ↗ são de afiliado do Mercado Livre — o MyDeck pode receber uma pequena comissão, sem custo pra você.</div>' : '');
}

function evPickFromRanking(id) {
  evSelectProduct(id);
  var sel = document.getElementById('ev-product'); if (sel) sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  evRenderRanking();
}

// ── Onde comprar (pacote 3, 17/10/2026): link do anúncio no ML (quando o produto é monitorado) e atalho pra Toybox ──
var evToyboxCache = {}; // set -> true/false (há produto ativo da Toybox naquela coleção?)
function evLinksHtml(prod) {
  var btn = 'display:inline-block;padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--fg);font-size:12px;text-decoration:none;cursor:pointer';
  var html = '';
  if (evRealPriceInfo && evRealPriceInfo.url) {
    html += '<a href="' + String(evRealPriceInfo.url).replace(/"/g, '%22') + '" target="_blank" rel="noopener sponsored" style="' + btn + '">🛒 Ver no Mercado Livre ↗</a>' +
      (evRealPriceInfo.affiliate ? ' <span style="font-size:10px;color:var(--muted)">(link de afiliado — o MyDeck pode receber uma pequena comissão, sem custo pra você)</span>' : '');
  }
  if (prod.set && evToyboxCache[prod.set]) {
    html += ' <a onclick="evGoToybox(\'' + prod.set + '\')" style="' + btn + '">🧸 Ver na Loja Toybox</a>';
  } else if (prod.set && !(prod.set in evToyboxCache)) {
    evCheckToybox(prod.set);
  }
  return html ? '<div id="ev-links" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px">' + html + '</div>' : '';
}
async function evCheckToybox(setId) {
  evToyboxCache[setId] = false; // marca já (evita consultas repetidas); vira true se achar
  try {
    if (typeof sbClient === 'undefined' || !sbClient) return;
    var r = await sbClient.from('mk_products').select('id', { count: 'exact', head: true }).eq('set_id', setId).eq('status', 'ativo');
    if (!r.error && r.count > 0) { evToyboxCache[setId] = true; renderEVResults(); }
  } catch (e) { /* sem Toybox: sem botão */ }
}
function evGoToybox(setId) {
  if (typeof goToTab === 'function') goToTab('mk');
  setTimeout(function() { if (typeof mkSetFilter === 'function') mkSetFilter('setId', setId); }, 450);
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

  // 17/10/2026: produtos de sets sem NENHUM preço de carta cadastrado (hoje: os 14 sets SV) levavam a "Banco de dados em
  // construção" — 42 dos 70 itens do menu. Ficam fora do menu até haver dados (o produto selecionado fica sempre).
  var dataBySet = {}, hidden = 0;
  function hasData(p) {
    if (!p.set) return true;
    if (!(p.set in dataBySet)) dataBySet[p.set] = evGetSetCards(p.set).some(function(c){ return c.price && c.price > 0; });
    return dataBySet[p.set];
  }
  var grupos = {};
  CATALOG.forEach(function(p){
    if (!hasData(p) && p.id !== evState.productId) { hidden++; return; }
    if(!grupos[p.grupo]) grupos[p.grupo]=[]; grupos[p.grupo].push(p);
  });
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
        '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Preço Pix (R$)</div>' +
        '<input type="number" id="ev-pix-price" value="' + pixPrice.toFixed(2) + '" min="0" step="0.01"' +
        ' oninput="evSetPrice(this.value)"' +
        ' style="background:var(--surface2);border:1px solid var(--accent);color:var(--fg);' +
        'padding:10px 14px;border-radius:8px;font-size:16px;font-family:\'Bebas Neue\',sans-serif;width:140px;letter-spacing:1px">' +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);padding-bottom:14px">' +
        (evRealPriceInfo
          ? '<span style="color:#16a34a">Preço real (menor achado no ML, últimos 7 dias' + (evRealPriceInfo.updatedAt ? ' · ' + new Date(evRealPriceInfo.updatedAt).toLocaleDateString('pt-BR') : '') + ')</span>'
          : 'MSRP estimado') +
        ' &nbsp;|&nbsp; ' + prod.boosters + ' booster' + (prod.boosters>1?'s':'') +
      '</div>' +
    '</div>' +
    (hidden ? '<div style="font-size:10px;color:var(--muted);margin:-12px 0 20px">' + hidden + ' produtos de sets antigos (Escarlate e Violeta) ficam fora da lista até os preços das cartas serem cadastrados.</div>' : '');
}

function renderEVResults() {
  var area = document.getElementById('ev-res');
  if (!area) return;
  var prod = CATALOG.find(function(p){return p.id===evState.productId;}) || CATALOG[0];
  var inp = document.getElementById('ev-pix-price');
  var pixPrice = inp ? parseFloat(inp.value)||prod.varejo : (evState.pixPrice!==null?evState.pixPrice:prod.varejo);
  // Clamp >= 0 (auditoria 03/08/2026): valor negativo no input caía direto aqui
  // e saía "ABAIXO DO EV — compra imediata" com lucro fictício.
  var precoInvalido = !!inp && !(parseFloat(inp.value) > 0);
  if (!(pixPrice > 0)) pixPrice = prod.varejo;
  var ev = calcEVForProduct(prod);

  if (ev.noData) {
    area.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;' +
      'padding:32px;text-align:center;color:var(--muted)">' +
      '<div style="font-size:32px;margin-bottom:12px">🚧</div>' +
      '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:20px;letter-spacing:2px;margin-bottom:8px">Banco de dados em construção</div>' +
      '<div style="font-size:12px">Os preços das cartas deste set ainda não foram cadastrados.<br>' +
      'Adicione os cards ao arquivo correspondente para habilitar o cálculo de EV.</div></div>';
    return;
  }

  var mult = ev.evTotal > 0 ? pixPrice / ev.evTotal : 0;
  var lucro = ev.evTotal - pixPrice;
  var retorno = pixPrice > 0 ? ev.evTotal / pixPrice * 100 : 0;                  // "recupero X% do que pago, em média"
  var retornoLiq = pixPrice > 0 ? ev.evTotal * (1 - EV_SELL_FEE) / pixPrice * 100 : 0; // se revender as cartas (taxa ~15%)
  var sim = evSimulate(prod);
  var chance = sim ? evSimChance(sim, pixPrice) : null;
  var faixaLo = sim ? evSimPct(sim, 0.10) : null, faixaHi = sim ? evSimPct(sim, 0.90) : null;
  function fmtPct(f) { return f <= 0 ? '0%' : (f < 0.005 ? '<1%' : (f > 0.995 ? '>99%' : Math.round(f * 100) + '%')); }
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
    '⚠ Preço de varejo estimado — ainda sem referência real de compra para este set. O EV/booster usa dados reais de mercado.' +
    '</div>'
  ) : '';

  // Aviso de variância: a nota S/A/B/C/D compara preço pago vs. EV MÉDIO, mas
  // a mesma nota vale pra 1 booster (altíssima variância — pode não sair hit
  // nenhum) e pra uma box de 36 (converge bem mais perto da média, lei dos
  // grandes números). Sem isso o usuário pode achar que "B — Bom" garante o
  // mesmo resultado nos dois casos, o que não é verdade estatisticamente.
  var varianceCaveat = (function(){
    var n = prod.boosters;
    if (n <= 1) return { icon:'🎲', txt:'Compra de 1 booster — altíssima variância. O resultado individual pode ficar bem longe da média (inclusive sem hit nenhum). A nota acima reflete o retorno médio no longo prazo, não uma garantia desta compra específica.' };
    if (n < 9)  return { icon:'🎲', txt:'Compra de ' + n + ' boosters — variância ainda alta. O resultado individual tende a divergir bastante do EV médio calculado.' };
    return { icon:'📊', txt:'Compra de ' + n + ' boosters — resultado converge bem mais perto da média esperada (lei dos grandes números). A nota acima é mais confiável aqui do que num booster avulso.' };
  })();
  var varianceBanner =
    '<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--teal);border-radius:8px;' +
    'padding:10px 14px;margin-bottom:16px;font-size:11px;color:var(--muted)">' +
    varianceCaveat.icon + ' ' + varianceCaveat.txt +
    '</div>';

  // Data da última atualização de preços deste set (price_updated_at.js,
  // mantido por scripts/update_prices.py). Caixas especiais (clefable-box/
  // chary-box) não têm prod.set — não fazem sentido aqui, ficam de fora.
  var updatedBanner = (prod.set && typeof formatPriceUpdatedAt === 'function') ? (
    '<div style="font-size:10px;color:var(--muted);margin-bottom:16px">' +
    '🗓️ Preços das cartas atualizados em: <strong style="color:var(--fg)">' + formatPriceUpdatedAt(prod.set) + '</strong>' +
    '</div>'
  ) : '';

  // campo vazio/inválido: antes voltava ao preço de tabela em silêncio, parecendo que era o preço digitado
  var precoBanner = precoInvalido ? (
    '<div style="background:rgba(230,57,70,.10);border:1px solid var(--accent);border-radius:8px;' +
    'padding:10px 14px;margin-bottom:16px;font-size:11px;color:var(--accent)">' +
    'Informe o preço que você pagaria — enquanto isso o cálculo usa o preço de tabela (R$ ' + fmtR(prod.varejo) + ').' +
    '</div>'
  ) : '';

  var cel30Banner = '';
  if (prod.model === 'cel30') {
    var cl = ev.rarBreakdown.filter(function(r){ return r.key === 'classic'; })[0];
    var semClassic = cl ? ev.evBooster - cl.evContrib : ev.evBooster;
    cel30Banner =
      '<div style="background:rgba(247,183,49,.12);border:1px solid var(--gold);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:var(--gold);line-height:1.6">' +
      '⚠ <b>Taxas não oficiais.</b> A Pokémon Company não publica pull rates; usamos a média de contagens da comunidade (de ~400 a ~4.000 pacotes por fonte). ' +
      'Os preços das cartas são de lançamento e tendem a cair. O EV deste set é dominado pela <b>Coleção Clássica</b> (1 em cada 10 pacotes; o Charizard 4/102 vale R$ 1.220): ' +
      'sem ela o EV por booster seria R$ ' + fmtR(semClassic) + ' (hoje R$ ' + fmtR(ev.evBooster) + '). Os 3 Mews RGB ficam fora do cálculo (sem taxa confiável). ' +
      'Promos, adesivos, moeda, fichário e demais itens do kit não entram.' +
      '</div>';
  }
  area.innerHTML = precoBanner + estimadoBanner + cel30Banner + varianceBanner + updatedBanner + evLinksHtml(prod) +
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
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:42px;color:#fff;line-height:1">' + Math.round(retorno) + '%</div>' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase">retorno esperado</div>' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:2px">você paga ' + mult.toFixed(2) + '× o EV</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:24px">' +
      kpi('EV / booster', fmtR(ev.evBooster), 'var(--fg)') +
      kpi('EV total (' + prod.boosters + 'x)', fmtR(ev.evTotal), 'var(--fg)') +
      kpi('Você paga', fmtR(pixPrice), 'var(--gold)') +
      kpi('Lucro esperado', (lucro>=0?'+':'') + fmtR(lucro), lucroColor) +
      (sim ? kpi('Chance de recuperar o valor pago', fmtPct(chance), chance >= 0.5 ? '#43e97b' : (chance >= 0.2 ? 'var(--gold)' : '#e74c3c')) : '') +
      (sim ? kpi('Faixa provável (80% dos casos)', 'R$' + fmtR(faixaLo) + ' – R$' + fmtR(faixaHi), 'var(--fg)') : '') +
      kpi('Retorno se revender (taxa ~' + Math.round(EV_SELL_FEE * 100) + '%)', Math.round(retornoLiq) + '%', 'var(--fg)') +
    '</div>' +
    (sim ? '<div style="font-size:10px;color:var(--muted);margin:-12px 0 24px;line-height:1.6">Chance e faixa vêm de ' + EV_SIM_TRIALS.toLocaleString('pt-BR') + ' aberturas simuladas com as taxas de pull e os preços atuais das cartas (bulk fora, como no EV). O EV é uma média: numa abertura só, o resultado real costuma ficar bem longe dela.</div>' : '') +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;' +
    'padding:14px 18px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
      '<div><div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Teto de compra (EV - 15%)</div>' +
      '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;color:var(--gold)">' + fmtR(precoAlvo) + '</div></div>' +
      '<div style="font-size:12px">' + topoAlvo + '</div>' +
    '</div>' +
    '<div style="font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:10px">Composição do EV por raridade</div>' +
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
      (prod.model === 'cel30'
        ? 'Pack da Celebração de 30 Anos: 5 cartas laminadas + 1 Energia Básica laminada (1 Pikachu garantida). Taxas da comunidade · Teto = EV - 15% (margem de segurança). Bulk excluído do cálculo.'
        : 'Pack BR: 6 cartas (1 energia + 4 comuns + 1 slot raro). Taxas calibradas para 6–11 hits por display · Teto = EV - 15% (margem de segurança). Bulk excluído do cálculo.') +
    '</div>';
}

function renderEV() {
  var wrap = document.getElementById('ev-wrap');
  if (!wrap) return;
  if (!document.getElementById('ev-ctrl')) {
    wrap.innerHTML = '<div id="ev-ctrl"></div><div id="ev-res"></div><div id="ev-rank"></div><div id="ev-msrp"></div>';
  }
  renderEVControls();
  renderEVResults();
  evApplyRealPrice(evState.productId);
  evRenderRanking();
  evRenderMsrp();
}

function initEV() { renderEV(); }
