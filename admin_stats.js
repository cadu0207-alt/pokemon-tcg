// ================================================================
// MyDeck — Mini Dashboard Admin (admin_stats.js)
// Mostra, só pra conta do Eduardo, um resumo rápido de cadastros e uso
// (cadastros na semana, usuários ativos, cartas coletadas, produtos
// rastreados, último cadastro, última carta coletada, gráfico de
// acessos x cadastros por dia) direto na aba Dashboard — sem precisar
// abrir o SQL Editor toda vez. Depende de isAdmin()/sbClient já
// definidos em lojas.js (carregado antes deste arquivo).
// ================================================================

function fmtStatDate(iso) {
  if (!iso) return 'ainda não';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function renderAdminStats() {
  const holder = document.getElementById('admin-stats-wrap');
  if (!holder) return;
  if (typeof isAdmin !== 'function' || !isAdmin()) { holder.innerHTML = ''; return; }

  holder.innerHTML = '<div class="admin-stats-loading">Carregando estatisticas do site...</div>';

  const { data, error } = await sbClient.rpc('admin_dashboard_stats');
  if (error) {
    holder.innerHTML = '<div class="admin-stats-loading">Erro ao carregar estatisticas: ' + error.message + '</div>';
    return;
  }

  const s = data || {};
  const items = [
    { label: 'Usuarios cadastrados', value: s.total_users ?? '-', icon: '01' },
    { label: 'Cadastros (7 dias)', value: s.signups_7d ?? '-', icon: '02' },
    { label: 'Cadastros (30 dias)', value: s.signups_30d ?? '-', icon: '03' },
    { label: 'Usuarios ativos', value: s.active_users ?? '-', icon: '04' },
    { label: 'Cartas coletadas (total)', value: s.total_cards_collected ?? '-', icon: '05' },
    { label: 'Compras registradas', value: s.total_purchases ?? '-', icon: '06' },
    { label: 'Produtos rastreados (ML)', value: s.tracked_products ?? '-', icon: '07' },
  ];

  const cardsHtml = items.map(function(i) {
    return '<div class="admin-stat-card">' +
      '<div class="admin-stat-value">' + i.value + '</div>' +
      '<div class="admin-stat-label">' + i.label + '</div>' +
    '</div>';
  }).join('');

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:0">Admin - Visao Geral do Site</div>' +
    '<div class="admin-stats-grid">' + cardsHtml + '</div>' +
    '<div class="admin-stats-lastrow">' +
      '<span>Ultimo cadastro: <strong>' + fmtStatDate(s.last_signup_at) + '</strong></span>' +
      '<span>Ultima carta coletada: <strong>' + fmtStatDate(s.last_card_at) + '</strong></span>' +
    '</div>' +
    '<div id="admin-usage-chart-wrap" style="margin-top:16px"></div>';

  renderAdminUsageChart();
}

async function renderAdminUsageChart() {
  const holder = document.getElementById('admin-usage-chart-wrap');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando grafico de uso...</div>';

  const { data, error } = await sbClient.rpc('admin_usage_timeline', { days: 30 });
  if (error) {
    holder.innerHTML = '<div class="admin-stats-loading">Erro ao carregar grafico: ' + error.message + '</div>';
    return;
  }

  const rows = data || [];
  if (!rows.length) { holder.innerHTML = ''; return; }

  const visits = rows.map(function(r){ return +r.visits || 0; });
  const signups = rows.map(function(r){ return +r.signups || 0; });
  const n = rows.length;
  const maxV = Math.max.apply(null, [1].concat(visits).concat(signups));

  const W = 760, H = 180, PAD_L = 34, PAD_R = 14, PAD_T = 14, PAD_B = 26;
  function xPos(i) { return PAD_L + (n > 1 ? i / (n - 1) : 0) * (W - PAD_L - PAD_R); }
  function yPos(v) { return PAD_T + (1 - v / maxV) * (H - PAD_T - PAD_B); }

  function lineFor(vals, color) {
    const pts = vals.map(function(v, i){ return xPos(i).toFixed(1) + ',' + yPos(v).toFixed(1); }).join(' ');
    const dots = vals.map(function(v, i) {
      const r = (i === n - 1) ? 3.5 : 2;
      return '<circle cx="' + xPos(i).toFixed(1) + '" cy="' + yPos(v).toFixed(1) + '" r="' + r + '" fill="' + color + '"><title>' + rows[i].day + ': ' + v + '</title></circle>';
    }).join('');
    return '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + dots;
  }

  const guideVals = [0, maxV / 2, maxV];
  const guides = guideVals.map(function(v) {
    const yy = yPos(v).toFixed(1);
    return '<line x1="' + PAD_L + '" y1="' + yy + '" x2="' + (W - PAD_R) + '" y2="' + yy + '" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>' +
      '<text x="' + (PAD_L - 6) + '" y="' + (+yy + 3) + '" text-anchor="end" font-size="9" fill="var(--muted)" font-family="Space Mono, monospace">' + Math.round(v) + '</text>';
  }).join('');

  function dLbl(d) {
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }
  const idxs = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1];
  const dateLbls = idxs.map(function(i) {
    return '<text x="' + xPos(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="Space Mono, monospace">' + dLbl(rows[i].day) + '</text>';
  }).join('');

  let totalVisits = 0; for (let i = 0; i < visits.length; i++) totalVisits += visits[i];
  let totalSignups = 0; for (let i = 0; i < signups.length; i++) totalSignups += signups[i];

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:0">Uso do Site - Ultimos 30 dias</div>' +
    '<div class="panel">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;overflow:visible">' +
        guides +
        lineFor(visits, '#2563eb') +
        lineFor(signups, 'var(--accent)') +
        dateLbls +
      '</svg>' +
      '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-family:Space Mono, monospace;font-size:11px;display:flex;gap:18px;flex-wrap:wrap">' +
        '<span style="color:#2563eb">Acessos: <b>' + totalVisits + '</b> no periodo</span>' +
        '<span style="color:var(--accent)">Cadastros: <b>' + totalSignups + '</b> no periodo</span>' +
      '</div>' +
      '<div class="admin-stats-loading" style="margin-top:6px">Acessos contam so usuarios logados, 1x por dia por conta - o historico comeca a partir do deploy desta feature.</div>' +
    '</div>';
}

async function logSiteVisit() {
  if (!sbClient || typeof uid !== 'function') return;
  const userId = uid();
  if (!userId) return;
  const today = new Date().toISOString().slice(0, 10);
  await sbClient.from('site_visits').upsert(
    { user_id: userId, visit_date: today },
    { onConflict: 'user_id,visit_date', ignoreDuplicates: true }
  );
}

(function hookAdminStatsIntoDash() {
  function tryHook() {
    if (typeof window.go !== 'function' || typeof window._updateUserChip !== 'function') {
      setTimeout(tryHook, 50);
      return;
    }
    // ADMIN 11/08/2026: renderAdminStats() não é mais disparado ao abrir o
    // Dashboard — agora só roda quando a aba Admin abre (admin_panel.js /
    // renderAdminTab()), pra não misturar consulta de admin com a tela que
    // todo usuário vê.
    const originalUpdateChip = window._updateUserChip;
    window._updateUserChip = function (user) {
      originalUpdateChip(user);
      if (user) logSiteVisit();
    };
  }
  tryHook();
})();

// ADMIN 11/08/2026: o disparo automático no load (quando o Dashboard já
// abre ativo) saiu daqui — quem decide quando renderAdminStats() roda agora
// é só a aba Admin (admin_panel.js/renderAdminTab()).
