/**
 * ev_calculator.js — EV Calculator para sets Pokemon TCG COPAG PT-BR
 *
 * Pull rates reais de ME04 (Deck Certo / TCGplayer, >8.500 packs):
 *   Rara Dupla:       1 em 5   = 20.30%
 *   Ilustracao Rara:  1 em 9   = 10.66%
 *   Rara Ultra:       1 em 12  =  8.29%
 *   Ilustr. Especial: 1 em 83  =  1.21%
 *   Mega Hiper Raro:  1 em 956 =  0.10%
 *   Rara base:        restante  = ~59.44%
 */

const PULL_RATES = {
  'Rara':              { prob: 0.5944, label: 'Rara base (~59% dos slots)' },
  'Dupla Rara':        { prob: 1/5,   label: 'Dupla Rara (RR) — 1/5' },
  'Ilustr. Rara':      { prob: 1/9,   label: 'Ilustracao Rara (IR) — 1/9' },
  'Rara Ultra':        { prob: 1/12,  label: 'Rara Ultra (UR) — 1/12' },
  'Ilustr. Esp. Rara': { prob: 1/83,  label: 'Ilustr. Especial (SAR) — 1/83' },
  'Mega Hyper Rare':   { prob: 1/956, label: 'Mega Hiper Raro — 1/956' },
  'Rara (Holo)':       { prob: 0,     label: 'Rara Holo (nao existe em ME04)' },
  'Comum':             { prob: 3.0,   label: 'Comum' },
  'Incomum':           { prob: 1.0,   label: 'Incomum' },
};

function normalizeRare(rare) {
  var r = (rare||'').toLowerCase();
  if (r.includes('attack rare') || r.includes('hyper') || r.includes('gold')) return 'Mega Hyper Rare';
  if (r.includes('sar') || r.includes('especial') || (r.includes('esp') && r.includes('ilustr'))) return 'Ilustr. Esp. Rara';
  if (r.includes(' ir') || (r.includes('ilustr') && !r.includes('esp'))) return 'Ilustr. Rara';
  if (r.includes('ur') || r.includes('ultra'))                           return 'Rara Ultra';
  if (r.includes('dupla') || r.includes('rr') || r.includes('ex'))      return 'Dupla Rara';
  if (r.includes('rara') && (r.includes('holo') || r.includes('foil'))) return 'Rara (Holo)';
  if (r.includes('rara'))    return 'Rara';
  if (r.includes('incomum')) return 'Incomum';
  return 'Comum';
}

const PRODUCTS = [
  { id: 'booster',  label: 'Booster Avulso',       boosters: 1,  official: 14.99 },
  { id: 'blister3', label: 'Blister Triplo',        boosters: 3,  official: 44.99 },
  { id: 'blister4', label: 'Blister Quadruplo',     boosters: 4,  official: 59.99 },
  { id: 'etb',      label: 'Elite Trainer Box',     boosters: 9,  official: 189.99 },
  { id: 'display',  label: 'Display (36 boosters)', boosters: 36, official: 539.99 },
];

const EV_EXCLUDE = new Set(['Comum', 'Incomum']);

/* calcEV: retorna { evMin, evAvg, evMax, breakdown } */
function calcEV(cards) {
  var tradeable = cards.filter(function(c){ return !EV_EXCLUDE.has(normalizeRare(c.rare)); });
  var byRare = {};
  tradeable.forEach(function(c) {
    var nr = normalizeRare(c.rare);
    if (!byRare[nr]) byRare[nr] = [];
    byRare[nr].push(c);
  });

  var evMin = 0, evAvg = 0, evMax = 0;
  var breakdown = [];

  Object.keys(byRare).forEach(function(nr) {
    var grp   = byRare[nr];
    var prices = grp.map(function(c){ return c.price || 0; });
    var minV  = Math.min.apply(null, prices);
    var avgV  = prices.reduce(function(a,b){ return a+b; }, 0) / prices.length;
    var maxV  = Math.max.apply(null, prices);
    var rate  = PULL_RATES[nr];
    if (!rate || !rate.prob) return;

    var cMin = minV * rate.prob;
    var cAvg = avgV * rate.prob;
    var cMax = maxV * rate.prob;
    evMin += cMin; evAvg += cAvg; evMax += cMax;

    var sorted = grp.slice().sort(function(a,b){ return (b.price||0)-(a.price||0); });
    breakdown.push({
      rare: nr, label: rate.label, count: grp.length,
      minValue: minV, avgValue: avgV, maxValue: maxV,
      worstCard: sorted[sorted.length-1], topCard: sorted[0],
      evMin: cMin, evAvg: cAvg, evMax: cMax, prob: rate.prob
    });
  });

  breakdown.sort(function(a,b){ return b.evAvg - a.evAvg; });
  return { evMin: evMin, evAvg: evAvg, evMax: evMax, breakdown: breakdown };
}

/* ─── INIT ─── */
var evCurrentSet = 'me04';
function initEV() { renderEV(); }
window.evCurrentSet = evCurrentSet;

/* ─── RENDER ─── */
function renderEV() {
  var wrap = document.getElementById('ev-wrap');
  if (!wrap) return;

  var activeTab = document.querySelector('[id^="ev-set-"].active');
  var curSet = (activeTab ? activeTab.id.replace('ev-set-','') : null) || evCurrentSet || 'me04';
  var evMargin = parseInt((document.getElementById('ev-margin')||{}).value) || 15;

  var sets = {
    me04: typeof CARDS      !== 'undefined' ? CARDS      : [],
    me02: typeof CARDS_ME02 !== 'undefined' ? CARDS_ME02 : [],
    meg:  typeof CARDS_MEG  !== 'undefined' ? CARDS_MEG  : [],
  };

  ['me04','me02','meg'].forEach(function(s) {
    var el = document.getElementById('ev-set-'+s);
    if (el) el.classList.toggle('active', s === curSet);
  });

  var cards = sets[curSet].filter(function(c){ return c.price && c.price > 0; });
  if (!cards.length) {
    wrap.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center">Cartas sem preco — adicione precos ao arquivo de cartas.</div>';
    return;
  }

  var ev = calcEV(cards);
  var evMin = ev.evMin, evAvg = ev.evAvg, evMax = ev.evMax, bd = ev.breakdown;
  var mg = 1 + evMargin/100;

  var ml = document.getElementById('ev-margin-lbl');
  if (ml) ml.textContent = evMargin + '%';

  var tradeCards = cards.filter(function(c){ return !EV_EXCLUDE.has(normalizeRare(c.rare)); });
  var total = tradeCards.reduce(function(s,c){ return s+(c.price||0); }, 0);
  var chase = tradeCards.slice().sort(function(a,b){ return (b.price||0)-(a.price||0); })[0];
  var msrp  = PRODUCTS[0].official;
  var ratio = Math.round(evAvg/msrp*100);
  var rc    = evAvg >= msrp ? 'var(--teal)' : 'var(--gold)';

  function pct(v,ref){ return Math.min(100,Math.round(v/ref*100)); }
  function bar(mn,av,mx,ref) {
    var rc2 = av >= ref ? 'var(--teal)' : av >= ref*0.7 ? 'var(--gold)' : 'var(--accent)';
    return '<div style="margin-top:10px">'
      +'<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:3px"><span>pior</span><span>medio</span><span>melhor</span></div>'
      +'<div style="position:relative;height:8px;background:var(--surface2);border-radius:4px;overflow:hidden">'
      +'<div style="position:absolute;left:0;top:0;height:100%;width:'+pct(mx,ref)+'%;background:rgba(6,214,160,.25);border-radius:4px"></div>'
      +'<div style="position:absolute;left:0;top:0;height:100%;width:'+pct(av,ref)+'%;background:'+rc2+';border-radius:4px"></div>'
      +'<div style="position:absolute;left:0;top:0;height:100%;width:'+pct(mn,ref)+'%;background:var(--accent);border-radius:4px"></div>'
      +'</div>'
      +'<div style="display:flex;justify-content:space-between;font-size:9px;margin-top:2px">'
      +'<span style="color:var(--accent)">R$'+fmtR(mn)+'</span>'
      +'<span style="color:'+rc2+'">R$'+fmtR(av)+'</span>'
      +'<span style="color:var(--teal)">R$'+fmtR(mx)+'</span>'
      +'</div></div>';
  }

  /* KPIs */
  var kpi = '<div class="kpi-grid" style="margin-bottom:28px">'
    +'<div class="kpi teal" style="grid-column:span 2">'
    +'<div class="kpi-label">EV por Booster &mdash; min / medio / max</div>'
    +'<div style="display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap">'
    +'<div><div style="font-size:9px;color:var(--muted);letter-spacing:2px;margin-bottom:3px">PESSIMISTA</div>'
    +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:var(--accent)">R$'+fmtR(evMin)+'</div></div>'
    +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:48px;color:var(--teal);line-height:1">R$'+fmtR(evAvg)+'</div>'
    +'<div style="text-align:right"><div style="font-size:9px;color:var(--muted);letter-spacing:2px;margin-bottom:3px">OTIMISTA</div>'
    +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:var(--teal)">R$'+fmtR(evMax)+'</div></div>'
    +'</div>'+bar(evMin,evAvg,evMax,msrp)
    +'<div style="font-size:10px;color:var(--muted);margin-top:6px">MSRP R$'+fmtR(msrp)
    +' &middot; EV medio = <span style="color:'+rc+'">'+ratio+'% do MSRP</span></div>'
    +'</div>'
    +'<div class="kpi gold"><div class="kpi-label">Valor Total do Set</div>'
    +'<div class="kpi-value" style="font-size:26px">R$'+fmtR(total)+'</div>'
    +'<div class="kpi-sub">'+tradeCards.length+' cartas tradeable</div></div>'
    +'<div class="kpi blue"><div class="kpi-label">Chase Card</div>'
    +'<div class="kpi-value" style="font-size:20px">R$'+fmtR(chase?chase.price:0)+'</div>'
    +'<div class="kpi-sub">'+(chase?chase.name:'&mdash;')+'</div></div>'
    +'</div>';

  /* Tabela produtos */
  var prodRows = PRODUCTS.map(function(p) {
    var pMin = evMin*p.boosters*mg, pAvg = evAvg*p.boosters*mg, pMax = evMax*p.boosters*mg;
    var r = evAvg*p.boosters/p.official*100;
    var c = r>=100?'var(--teal)':r>=70?'var(--gold)':'var(--accent)';
    var al = pAvg < p.official
      ? '<span style="color:var(--accent);font-size:10px">MSRP acima do EV</span>'
      : '<span style="color:var(--teal);font-size:10px">EV acima do MSRP</span>';
    return '<tr>'
      +'<td style="font-weight:600">'+p.label+'</td>'
      +'<td style="color:var(--muted)">'+p.boosters+'</td>'
      +'<td style="color:var(--muted)">R$'+fmtR(p.official)+'</td>'
      +'<td style="color:var(--accent)">R$'+fmtR(pMin)+'</td>'
      +'<td style="color:var(--teal);font-weight:700">R$'+fmtR(pAvg)+'</td>'
      +'<td style="color:var(--gold)">R$'+fmtR(pMax)+'</td>'
      +'<td style="color:'+c+'">'+r.toFixed(0)+'%</td>'
      +'<td>'+al+'</td></tr>';
  }).join('');

  var prodTable = '<div class="sec-title">Preco Justo por Produto (+'+evMargin+'% margem)</div>'
    +'<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:28px;overflow-x:auto">'
    +'<table class="tbl" style="margin:0;min-width:680px"><thead><tr>'
    +'<th>Produto</th><th>Boosters</th><th>MSRP</th>'
    +'<th style="color:var(--accent)">Min</th>'
    +'<th style="color:var(--teal)">Medio</th>'
    +'<th style="color:var(--gold)">Max</th>'
    +'<th>% MSRP</th><th>Status</th>'
    +'</tr></thead><tbody>'+prodRows+'</tbody></table></div>';

  /* Breakdown por raridade */
  var maxV = Math.max.apply(null, bd.map(function(b){ return b.evMax; }).concat([0.01]));
  var bdRows = bd.filter(function(b){ return b.evAvg > 0; }).map(function(b) {
    var bMin = Math.round(b.evMin/maxV*100);
    var bAvg = Math.round(b.evAvg/maxV*100);
    var bMax = Math.round(b.evMax/maxV*100);
    var every = b.prob <= 1 ? Math.round(1/b.prob) : 0;
    var pullStr = every > 0 ? '1/'+every+' boosters' : 'garantida';
    return '<div style="margin-bottom:18px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;flex-wrap:wrap;gap:4px">'
      +'<div><span style="font-size:12px;font-weight:600">'+b.label+'</span>'
      +'<span style="font-size:10px;color:var(--muted);margin-left:8px">'+b.count+' cartas &middot; '+pullStr+'</span></div>'
      +'<div style="font-size:10px;display:flex;gap:12px">'
      +'<span style="color:var(--accent)">min R$'+fmtR(b.evMin)+'</span>'
      +'<span style="color:var(--teal);font-weight:700">avg R$'+fmtR(b.evAvg)+'</span>'
      +'<span style="color:var(--gold)">max R$'+fmtR(b.evMax)+'</span>'
      +'</div></div>'
      +'<div style="position:relative;height:14px;background:var(--surface2);border-radius:4px;overflow:hidden">'
      +'<div style="position:absolute;left:0;top:0;height:100%;width:'+bMax+'%;background:rgba(6,214,160,.2);border-radius:4px"></div>'
      +'<div style="position:absolute;left:0;top:0;height:100%;width:'+bAvg+'%;background:linear-gradient(90deg,var(--teal),var(--blue));border-radius:4px;display:flex;align-items:center;padding-left:6px;font-size:9px;font-weight:700;color:var(--bg)">'+(bAvg>22?'R$'+fmtR(b.evAvg):'')+'</div>'
      +'<div style="position:absolute;left:0;top:0;height:100%;width:'+bMin+'%;background:var(--accent);border-radius:4px;opacity:.8"></div>'
      +'</div>'
      +'<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:2px">'
      +'<span>'+(b.worstCard?b.worstCard.name:'')+' <span style="color:var(--accent)">R$'+fmtR(b.minValue)+'</span></span>'
      +'<span>avg R$'+fmtR(b.avgValue)+'</span>'
      +'<span>'+(b.topCard?b.topCard.name:'')+' <span style="color:var(--gold)">R$'+fmtR(b.maxValue)+'</span></span>'
      +'</div></div>';
  }).join('');

  var bdBlock = '<div class="sec-title">Contribuicao por Raridade &mdash; min / avg / max</div>'
    +'<div class="panel" style="margin-bottom:28px">'+bdRows+'</div>';

  var nota = '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 18px;font-size:11px;color:var(--muted);line-height:1.6">'
    +'<strong style="color:var(--text)">Metodologia</strong><br>'
    +'Pull rates reais do TCGplayer (>8.500 packs): RR 1/5 &middot; IR 1/9 &middot; UR 1/12 &middot; SAR 1/83 &middot; Mega Hiper 1/956. '
    +'Rara base ocupa ~59% dos slots restantes. '
    +'<strong style="color:var(--accent)">Comum e Incomum excluidos</strong> (bulk sem mercado secundario). '
    +'Precos: media Liga Pokemon / Deck Certo. '
    +'<strong style="color:var(--gold)">EV e probabilistico: nao garante retorno por booster individual.</strong>'
    +'</div>';

  wrap.innerHTML = kpi + prodTable + bdBlock + nota;
}

window.initEV   = initEV;
window.renderEV = renderEV;
