/**
 * ev_calculator.js
 * Aba "Preço Justo" — EV Calculator para sets Pokémon TCG PT-BR
 *
 * COMO INTEGRAR:
 *   1. Adicionar <script src="ev_calculator.js"></script> antes do </body> no index.html
 *   2. Adicionar a aba no nav e o HTML da aba (ver tab_preco_justo.html)
 *   3. Chamar initEV() quando a aba for aberta
 */

/* ─────────────────────────────────────────────
   PULL RATES PT-BR (estimados / fonte COPAG)
   por booster de 10 cartas
───────────────────────────────────────────── */
const PULL_RATES = {
  // Garantido por booster
  'Comum':    { minPer: 5.0, avgPer: 5.5, label: 'Comum' },
  'Incomum':  { minPer: 2.5, avgPer: 3.0, label: 'Incomum' },
  'Rara':     { minPer: 0.5, avgPer: 0.7, label: 'Rara' },

  // ~1 a cada N boosters
  'Rara (Holo)':   { prob: 1/3,   label: 'Rara Holo (foil)' },
  'Dupla Rara':    { prob: 1/4,   label: 'Dupla Rara (ex/RR)' },
  'Ilustr. Rara':  { prob: 1/12,  label: 'Ilustração Rara (IR)' },
  'Rara Ultra':    { prob: 1/18,  label: 'Rara Ultra (UR)' },
  'Ilustr. Esp. Rara': { prob: 1/72,  label: 'Ilustr. Especial (SAR)' },
  'Mega Hyper Rare': { prob: 1/144, label: 'Mega Hyper Rare' },
};

// Mapeamento de raridade normalizada
function normalizeRare(rare) {
  const r = (rare||'').toLowerCase();
  if (r.includes('hyper') || r.includes('gold'))     return 'Mega Hyper Rare';
  if (r.includes('sar') || r.includes('especial'))   return 'Ilustr. Esp. Rara';
  if (r.includes(' ir') || (r.includes('ilustr') && !r.includes('esp'))) return 'Ilustr. Rara';
  if (r.includes('ur') || r.includes('ultra'))       return 'Rara Ultra';
  if (r.includes('dupla') || r.includes('rr') || r.includes('ex')) return 'Dupla Rara';
  if (r.includes('rara') && (r.includes('holo') || r.includes('foil'))) return 'Rara (Holo)';
  if (r.includes('rara'))  return 'Rara';
  if (r.includes('incomum')) return 'Incomum';
  return 'Comum';
}

/* ─────────────────────────────────────────────
   PRODUTOS E BOOSTERS
───────────────────────────────────────────── */
const PRODUCTS = [
  { id: 'booster',    label: 'Booster Avulso',      boosters: 1,  official: 14.99 },
  { id: 'blister3',   label: 'Blister Triplo',       boosters: 3,  official: 44.99 },
  { id: 'blister4',   label: 'Blister Quádruplo',    boosters: 4,  official: 59.99 },
  { id: 'etb',        label: 'Elite Trainer Box',    boosters: 9,  official: 189.99 },
  { id: 'display',    label: 'Display (36 boosters)',boosters: 36, official: 539.99 },
];

/* ─────────────────────────────────────────────
   CÁLCULO DE EV
───────────────────────────────────────────── */
function calcEV(cards) {
  // Agrupar por raridade normalizada
  const byRare = {};
  cards.forEach(c => {
    const nr = normalizeRare(c.rare);
    if (!byRare[nr]) byRare[nr] = { cards: [], totalValue: 0 };
    byRare[nr].cards.push(c);
    byRare[nr].totalValue += (c.price || 0);
  });

  // EV por booster para cada grupo
  let evPerBooster = 0;
  const breakdown = [];

  Object.entries(byRare).forEach(([nr, group]) => {
    const avgCardValue = group.totalValue / group.cards.length;
    const rate = PULL_RATES[nr];
    if (!rate) return;

    let evContrib = 0;
    if (rate.avgPer !== undefined) {
      // Cartas garantidas por booster
      evContrib = avgCardValue * rate.avgPer;
    } else if (rate.prob !== undefined) {
      // Probabilidade de tirar UMA carta desta raridade
      evContrib = avgCardValue * rate.prob;
    }

    evPerBooster += evContrib;
    breakdown.push({
      rare: nr,
      label: rate.label || nr,
      count: group.cards.length,
      avgValue: avgCardValue,
      topCard: [...group.cards].sort((a,b)=>(b.price||0)-(a.price||0))[0],
      evContrib,
      prob: rate.prob,
      avgPer: rate.avgPer,
    });
  });

  // Ordenar por contribuição ao EV
  breakdown.sort((a,b) => b.evContrib - a.evContrib);

  return { evPerBooster, breakdown };
}

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
// CORRIGIDO: usar var para que evSwitchSet() no HTML inline possa modificar
// (let/const no topo de script regular não são acessíveis via closures externas)
var evCurrentSet = 'me04';

function initEV() {
  renderEV();
  // Listeners redundantes (HTML já usa onclick="evSwitchSet()"), mas mantidos para segurança
}

// evSwitchSet é definido no HTML mas depende desta variável — manter compatibilidade
window.evCurrentSet = evCurrentSet;

/* ─────────────────────────────────────────────
   RENDER
───────────────────────────────────────────── */
function renderEV() {
  const wrap = document.getElementById('ev-wrap');
  if (!wrap) return;

  // Ler set ativo do DOM (robusto contra escopo de variáveis entre scripts)
  const activeTab = document.querySelector('[id^="ev-set-"].active');
  const curSet = activeTab?.id.replace('ev-set-','') || evCurrentSet || 'me04';

  // Ler margem do slider diretamente (não depende de initEV ser chamado)
  const evMargin = parseInt(document.getElementById('ev-margin')?.value) || 15;

  // CORRIGIDO: usar variáveis globais dos arquivos de cartas (não window.cardsXxx)
  const sets = {
    me04: (typeof CARDS      !== 'undefined' ? CARDS      : []),
    me02: (typeof CARDS_ME02 !== 'undefined' ? CARDS_ME02 : []),
    meg:  (typeof CARDS_MEG  !== 'undefined' ? CARDS_MEG  : []),
  };
  const setLabels = { me04:'🔥 ME04 — Caos Ascendente', me02:'👻 ME02 — Fogo Fantasmagórico', meg:'🌿 MEG — Megaevolução' };

  // Atualizar tabs ativas via DOM
  ['me04','me02','meg'].forEach(s => {
    document.getElementById('ev-set-'+s)?.classList.toggle('active', s === curSet);
  });

  const cards = sets[curSet].filter(c => c.price && c.price > 0);
  if (!cards.length) {
    wrap.innerHTML = `<div style="color:var(--muted);padding:40px;text-align:center">
      Cartas sem preço cadastrado — adicione preços ao arquivo de cartas para calcular o EV.</div>`;
    return;
  }

  const { evPerBooster, breakdown } = calcEV(cards);
  const margin = 1 + (evMargin / 100);

  // Atualizar slider label
  const marginLbl = document.getElementById('ev-margin-lbl');
  if (marginLbl) marginLbl.textContent = evMargin + '%';

  // Valor total do set
  const totalSetValue = cards.reduce((s,c) => s+(c.price||0), 0);
  const topCard = [...cards].sort((a,b)=>(b.price||0)-(a.price||0))[0];

  // KPIs
  const kpiHtml = `
  <div class="kpi-grid" style="margin-bottom:28px">
    <div class="kpi teal">
      <div class="kpi-label">🎯 EV por Booster</div>
      <div class="kpi-value">R$${fmtR(evPerBooster)}</div>
      <div class="kpi-sub">valor esperado médio</div>
    </div>
    <div class="kpi gold">
      <div class="kpi-label">💰 Valor Total do Set</div>
      <div class="kpi-value" style="font-size:28px">R$${fmtR(totalSetValue)}</div>
      <div class="kpi-sub">${cards.length} cartas com preço</div>
    </div>
    <div class="kpi blue">
      <div class="kpi-label">🃏 Carta Mais Cara</div>
      <div class="kpi-value" style="font-size:22px">R$${fmtR(topCard.price)}</div>
      <div class="kpi-sub">${topCard.name}</div>
    </div>
    <div class="kpi orange">
      <div class="kpi-label">📊 EV com +${evMargin}% Margem</div>
      <div class="kpi-value">R$${fmtR(evPerBooster * margin)}</div>
      <div class="kpi-sub">segurança do colecionador</div>
    </div>
  </div>`;

  // Tabela de produtos
  const prodRows = PRODUCTS.map(p => {
    const evProd = evPerBooster * p.boosters;
    const evProdMargin = evProd * margin;
    const ratio = evProd / p.official * 100;
    const ratioColor = ratio >= 100 ? 'var(--teal)' : ratio >= 70 ? 'var(--gold)' : 'var(--accent)';
    const precoJusto = evProd * margin;
    const alerta = precoJusto < p.official
      ? `<span style="color:var(--accent);font-size:10px">⚠ oficial R$${fmtR(p.official)} está ACIMA do EV</span>`
      : `<span style="color:var(--teal);font-size:10px">✓ EV SUPERIOR ao preço oficial</span>`;

    return `
    <tr>
      <td style="font-weight:600">${p.label}</td>
      <td style="font-family:'Space Mono',monospace;color:var(--muted)">${p.boosters}</td>
      <td style="font-family:'Space Mono',monospace;color:var(--muted)">R$${fmtR(p.official)}</td>
      <td style="font-family:'Space Mono',monospace;color:var(--teal)">R$${fmtR(evProd)}</td>
      <td style="font-family:'Space Mono',monospace;font-weight:700;color:${ratioColor}">${ratio.toFixed(0)}%</td>
      <td style="font-family:'Space Mono',monospace;color:var(--gold)">R$${fmtR(precoJusto)}</td>
      <td>${alerta}</td>
    </tr>`;
  }).join('');

  const prodTable = `
  <div class="sec-title">📦 Preço Justo por Produto</div>
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:28px">
    <table class="tbl" style="margin:0">
      <thead>
        <tr>
          <th>Produto</th>
          <th>Boosters</th>
          <th>Preço Oficial COPAG</th>
          <th>EV Total</th>
          <th>% do Preço Oficial</th>
          <th>Preço Justo (+${evMargin}%)</th>
          <th>Avaliação</th>
        </tr>
      </thead>
      <tbody>${prodRows}</tbody>
    </table>
  </div>`;

  // Breakdown por raridade
  const maxEV = Math.max(...breakdown.map(b => b.evContrib), 0.01);
  const bdRows = breakdown.filter(b => b.evContrib > 0).map(b => {
    const barW = Math.round(b.evContrib / maxEV * 100);
    const pullInfo = b.avgPer !== undefined
      ? `~${b.avgPer} por booster`
      : `1 a cada ${Math.round(1/b.prob)} boosters`;
    return `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;flex-wrap:wrap;gap:6px">
        <div>
          <span style="font-size:12px;font-weight:600">${b.label}</span>
          <span style="font-size:10px;color:var(--muted);margin-left:8px">${b.count} cartas · avg R$${fmtR(b.avgValue)}</span>
        </div>
        <div style="text-align:right">
          <span style="font-family:'Space Mono',monospace;font-size:12px;color:var(--teal)">EV: R$${fmtR(b.evContrib)}</span>
          <span style="font-size:10px;color:var(--muted);margin-left:8px">${pullInfo}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;height:18px;background:var(--surface2);border-radius:4px;overflow:hidden">
          <div style="width:${barW}%;height:100%;background:linear-gradient(90deg,var(--teal),var(--blue));
               border-radius:4px;display:flex;align-items:center;padding-left:8px;
               font-size:9px;font-weight:700;color:var(--bg);font-family:'Space Mono',monospace">
            ${barW > 20 ? 'R$'+fmtR(b.evContrib) : ''}
          </div>
        </div>
      </div>
      ${b.topCard?`<div style="font-size:10px;color:var(--muted);margin-top:3px">
        Chase card: <span style="color:var(--gold)">${b.topCard.name}</span>
        <span style="color:var(--accent2)">— R$${fmtR(b.topCard.price)}</span>
        <span style="color:var(--muted)">(${b.prob?'prob ' + (b.prob*100).toFixed(2)+'%/booster':'garantida'})</span>
      </div>`:''}
    </div>`;
  }).join('');

  const bdBlock = `
  <div class="sec-title">📊 Contribuição por Raridade ao EV</div>
  <div class="panel" style="margin-bottom:28px">${bdRows}</div>`;

  // Nota metodológica
  const nota = `
  <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 18px;
       font-size:11px;color:var(--muted);line-height:1.6">
    <strong style="color:var(--text)">ℹ️ Metodologia</strong><br>
    EV calculado com base nos preços de mercado cadastrados e pull rates estimados para o PT-BR (Pokémon Copag).
    Raridades "garantidas" (Comum/Incomum/Rara base) contribuem proporcionalmente à quantidade por booster.
    Raridades de slot único (RR, IR, UR, SAR) contribuem com valor × probabilidade de saída.
    <strong style="color:var(--gold)">O EV é uma média — não garante retorno individual por booster.</strong>
    Pull rates reais podem variar; estes são estimativas baseadas em aberturas relatadas pela comunidade.
  </div>`;

  wrap.innerHTML = kpiHtml + prodTable + bdBlock + nota;
}

function fmtR(v) { return (v||0).toFixed(2).replace('.',','); }

window.initEV    = initEV;
window.renderEV  = renderEV;
