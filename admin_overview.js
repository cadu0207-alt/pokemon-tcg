// ================================================================
// MyDeck — Painel Admin: Visão Geral (admin_overview.js, 17/10/2026)
// Três blocos num lugar só, alimentados por UMA chamada (RPC admin_overview, só equipe):
//   • Pendências de todos os módulos (mensagens sem resposta, pagamentos de leilão vencidos, pedidos da Toybox…)
//   • Atividade REAL (quem abriu o site hoje / 7 / 30 dias — antes o cartão "Usuários ativos" contava quem tem ≥1 carta no
//     fichário, o que dava 55 quando só 43 pessoas tinham aberto o site no mês)
//   • Saúde do sistema (jobs do cron, frescor dos preços do ML, push, minigame)
// Depende de sbClient/isAdmin/esc/fmtR (app.js, lojas.js) e de openAdminSection (admin_panel.js).
// ================================================================

function aoAgo(iso) {
  if (!iso) return 'nunca';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'agora';
  if (m < 60) return m + ' min atrás';
  const h = Math.floor(m / 60);
  if (h < 48) return h + ' h atrás';
  return Math.floor(h / 24) + ' dias atrás';
}

async function renderAdminOverview() {
  const holder = document.getElementById('admin-overview-wrap');
  if (!holder) return;
  if (typeof isAdmin !== 'function' || !isAdmin()) { holder.innerHTML = ''; return; }
  holder.innerHTML = '<div class="admin-stats-loading">Carregando visão geral…</div>';

  const { data, error } = await sbClient.rpc('admin_overview');
  if (error || !data) {
    holder.innerHTML = '<div class="admin-stats-loading">Não foi possível carregar a visão geral' + (error ? ': ' + esc(error.message) : '') + '</div>';
    return;
  }
  const p = data.pending || {}, u = data.usage || {}, h = data.health || {}, m = data.minigame || {};
  const n = function (v) { return +v || 0; };

  // ── pendências ──
  const items = [
    { n: n(p.feedback_unanswered), icon: '💬', label: 'mensagens de usuários sem resposta', act: "openAdminSection('feedback')" },
    { n: n(p.auction_overdue_orders), icon: '🔨', label: 'pagamentos de leilão vencidos (R$ ' + fmtR(p.auction_overdue_amount) + ')', act: "goToTab('leilao')" },
    { n: n(p.mk_to_ship), icon: '🧸', label: 'pedidos da Toybox pagos, pra enviar', act: "goToTab('mk')" },
    { n: n(p.mk_waiting_payment), icon: '⏳', label: 'pedidos da Toybox aguardando pagamento', act: "goToTab('mk')" },
    { n: n(p.positivo_pending), icon: '✅', label: 'indicações do Cadastro Positivo pendentes', act: "openAdminSection('positivo')" },
    { n: n(p.stores_pending), icon: '🏪', label: 'lojas confiáveis pendentes', act: "openAdminSection('marketplace')" },
  ].filter(function (i) { return i.n > 0; });
  window.__adminOverviewPending = items.reduce(function (t, i) { return t + i.n; }, 0);
  // selos das seções que só carregam quando abertas (admin_panel.js lê estas variáveis em applyAdminSectionStates)
  window.__adminFeedbackUnread = n(p.feedback_unanswered);
  window.__adminMktPending = n(p.stores_pending);
  window.__adminPositivoPending = n(p.positivo_pending);
  const pendHtml = items.length
    ? items.map(function (i) {
        return '<div class="admin-ov-row" role="button" tabindex="0" onclick="' + i.act + '" onkeydown="if(event.key===\'Enter\')this.click()">' +
          '<span class="admin-ov-n">' + i.n + '</span><span>' + i.icon + ' ' + i.label + '</span><span class="admin-ov-go">abrir →</span></div>';
      }).join('')
    : '<div class="admin-ov-ok">✅ Nada pendente agora.</div>';

  // ── atividade ──
  const stat = function (v, l) { return '<div class="admin-stat-card"><div class="admin-stat-value">' + v + '</div><div class="admin-stat-label">' + l + '</div></div>'; };
  const usageHtml = '<div class="admin-stats-grid">' +
    stat(n(u.active_1d), 'Abriram o site hoje (24 h)') + stat(n(u.active_7d), 'Ativos em 7 dias') + stat(n(u.active_30d), 'Ativos em 30 dias') +
    stat(n(u.signups_7d), 'Cadastros em 7 dias') + stat(n(u.signups_30d), 'Cadastros em 30 dias') + stat(n(u.total_users), 'Usuários cadastrados') + '</div>' +
    '<div class="admin-stats-loading" style="margin-top:6px">Ativo = abriu alguma aba do site no período (usuário logado). ' + n(u.with_collection) + ' usuários já registraram pelo menos 1 carta no fichário.</div>';

  // ── saúde ──
  const mlMin = h.ml_last_found_at ? (Date.now() - new Date(h.ml_last_found_at).getTime()) / 60000 : Infinity;
  const badCron = (h.cron || []).filter(function (c) { return !c.active || n(c.failures_24h) > 0; }).length;
  const flag = function (ok) { return ok ? '<span class="admin-ov-pill ok">ok</span>' : '<span class="admin-ov-pill bad">atenção</span>'; };
  const cronRows = (h.cron || []).map(function (c) {
    const bad = !c.active || n(c.failures_24h) > 0;
    return '<tr' + (bad ? ' class="admin-ov-bad"' : '') + '><td>' + esc(c.job) + '</td><td>' + esc(c.schedule) + '</td><td>' + aoAgo(c.last_run) + '</td><td>' + n(c.runs_24h) + '</td><td>' + n(c.failures_24h) + '</td><td>' + (c.active ? esc(c.last_status || '—') : 'desligado') + '</td></tr>';
  }).join('');
  const healthHtml =
    '<div class="admin-ov-health">' +
      '<div>' + flag(mlMin < 60) + ' Preços do Mercado Livre: última leitura <b>' + aoAgo(h.ml_last_found_at) + '</b> · ' + n(h.ml_terms_active) + ' produtos monitorados' +
        (n(h.ml_terms_stale) ? ' · <span title="Produtos sem nenhuma leitura nas últimas 6 horas — em geral é produto esgotado no ML">' + n(h.ml_terms_stale) + ' sem leitura há +6 h</span>' : '') + '</div>' +
      '<div>' + flag(badCron === 0) + ' Tarefas agendadas (cron): <b>' + (h.cron || []).length + '</b> jobs' + (badCron ? ' · <b>' + badCron + ' com falha/desligado</b>' : ' · sem falhas nas últimas 24 h') + '</div>' +
      '<div>' + flag(n(h.push_queue_pending) < 5) + ' Push: <b>' + n(h.push_subscriptions) + '</b> inscrições de <b>' + n(h.push_users) + '</b> pessoas · fila de avisos pendentes: ' + n(h.push_queue_pending) + '</div>' +
      '<div>🎮 Minigame hoje: <b>' + n(m.players_today) + '</b> jogadores · ' + n(m.spawns_today) + ' aparições · ' + n(m.catch_attempts_today) + ' capturas tentadas · ' + n(m.battles_today) + ' batalhas' + (n(m.at_cap_today) ? ' · <b>' + n(m.at_cap_today) + ' no limite diário</b>' : '') + '</div>' +
    '</div>' +
    '<details class="admin-ov-details"><summary>Ver tarefas agendadas</summary><div style="overflow-x:auto"><table class="admin-users-table"><thead><tr><th>Job</th><th>Agenda</th><th>Última execução</th><th>Execuções 24 h</th><th>Falhas 24 h</th><th>Status</th></tr></thead><tbody>' + cronRows + '</tbody></table></div></details>';

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:0">🔔 Pendências</div>' + pendHtml +
    '<div class="sec-title" style="margin-top:22px">📈 Atividade</div>' + usageHtml +
    '<div class="sec-title" style="margin-top:22px">🩺 Saúde do sistema</div>' + healthHtml +
    '<div class="admin-stats-loading" style="margin-top:8px">Atualizado ' + aoAgo(data.generated_at) + ' · <a href="#" onclick="renderAdminOverview();return false">atualizar</a></div>';

  if (typeof setAdminSectionBadge === 'function') setAdminSectionBadge('overview', window.__adminOverviewPending);
}
