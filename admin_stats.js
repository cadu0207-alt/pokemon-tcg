// ================================================================
// MyDeck — Mini Dashboard Admin (admin_stats.js)
// Mostra, só pra conta do Eduardo, um resumo rápido de cadastros e uso
// (cadastros na semana, usuários ativos, cartas coletadas, produtos
// rastreados) direto na aba Dashboard — sem precisar abrir o SQL
// Editor do Supabase toda vez. Depende de isAdmin()/sbClient já
// definidos em lojas.js (carregado antes deste arquivo).
// ================================================================

async function renderAdminStats() {
  const holder = document.getElementById('admin-stats-wrap');
  if (!holder) return;
  if (typeof isAdmin !== 'function' || !isAdmin()) { holder.innerHTML = ''; return; }

  holder.innerHTML = '<div class="admin-stats-loading">📊 Carregando estatísticas do site...</div>';

  const { data, error } = await sbClient.rpc('admin_dashboard_stats');
  if (error) {
    holder.innerHTML = '<div class="admin-stats-loading">⚠️ Erro ao carregar estatísticas: ' + error.message + '</div>';
    return;
  }

  const s = data || {};
  const items = [
    { label: 'Usuários cadastrados', value: s.total_users ?? '–', icon: '👤' },
    { label: 'Cadastros (7 dias)', value: s.signups_7d ?? '–', icon: '🆕' },
    { label: 'Cadastros (30 dias)', value: s.signups_30d ?? '–', icon: '📅' },
    { label: 'Usuários ativos', value: s.active_users ?? '–', icon: '⚡' },
    { label: 'Cartas coletadas (total)', value: s.total_cards_collected ?? '–', icon: '🃏' },
    { label: 'Compras registradas', value: s.total_purchases ?? '–', icon: '💸' },
    { label: 'Produtos rastreados (ML)', value: s.tracked_products ?? '–', icon: '🛍️' },
  ];

  const cardsHtml = items.map(i => (
    '<div class="admin-stat-card">' +
      '<div class="admin-stat-icon">' + i.icon + '</div>' +
      '<div class="admin-stat-value">' + i.value + '</div>' +
      '<div class="admin-stat-label">' + i.label + '</div>' +
    '</div>'
  )).join('');

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:0">📊 Admin · Visão Geral do Site</div>' +
    '<div class="admin-stats-grid">' + cardsHtml + '</div>';
}

// Hook: chama junto quando a aba Dashboard renderiza (ver app.js → go()).
// Definido aqui em vez de sobrescrever go() pra manter tudo centralizado
// nesse arquivo — a chamada real está encadeada logo abaixo.
(function hookAdminStatsIntoDash() {
  const tryHook = () => {
    if (typeof window.go !== 'function') { setTimeout(tryHook, 50); return; }
    const originalGo = window.go;
    window.go = function (id, el) {
      originalGo(id, el);
      if (id === 'dash' && typeof renderAdminStats === 'function') renderAdminStats();
    };
  };
  tryHook();
})();

// Se a aba Dashboard já estiver ativa no load (padrão inicial do site),
// renderiza assim que o usuário estiver logado.
document.addEventListener('DOMContentLoaded', () => {
  const pane = document.getElementById('dash');
  if (pane && pane.classList.contains('active')) {
    setTimeout(() => { if (typeof isAdmin === 'function' && isAdmin()) renderAdminStats(); }, 800);
  }
});
