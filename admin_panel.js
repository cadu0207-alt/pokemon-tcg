// ================================================================
// MyDeck — Painel Admin unificado (admin_panel.js)
// Criado 11/08/2026 a pedido do Eduardo: antes, as ferramentas de admin
// (estatísticas do site, mensagens de usuários, publicar atualização,
// aprovar Loja Confiável, aprovar Cadastro Positivo, cadastrar produto/
// cupom do Mercado Livre) ficavam ESPALHADAS e MISTURADAS dentro das
// abas públicas (Dashboard, Lojas & Ofertas, Lojas Confiáveis, Cadastro
// Positivo) — só escondidas por isAdmin(), mas ainda ocupando o mesmo
// espaço/DOM que qualquer usuário comum carregava.
//
// Este arquivo NÃO reimplementa nada — só:
//   1. Mostra/esconde a aba "🔐 Admin" (nav-tab-admin) conforme isAdmin().
//   2. Quando a aba abre, chama as funções de render que já existiam
//      espalhadas pelos outros arquivos, agora todas escritas dentro dos
//      containers que moraram pra dentro da aba Admin (index.html):
//        admin-stats-wrap    → admin_stats.js      (renderAdminStats)
//        admin-feedback-wrap → feedback.js         (renderAdminFeedback)
//        admin-updates-wrap  → updates.js           (renderUpdatesAdminForm)
//        mkt-pending-wrap    → marketplace.js       (renderStoreLists)
//        pc-pending-wrap     → positivo.js          (renderPositiveLists)
//        lojas-admin         → lojas_admin_collapse.js (renderAdminPanel)
//
// Depende de isAdmin() (lojas.js) e _updateUserChip()/go() (app.js) já
// definidos — precisa carregar por último, depois de todos os arquivos
// acima.
// ================================================================

function updateAdminTabVisibility() {
  const btn = document.getElementById('nav-tab-admin');
  if (!btn) return;
  const show = typeof isAdmin === 'function' && isAdmin();
  btn.style.display = show ? '' : 'none';
  if (!show) {
    // Se por algum motivo a aba Admin estava ativa (ex: sessão expirou/
    // trocou de conta) e o usuário deixou de ser admin, volta pro Dashboard
    // em vez de deixar uma aba vazia e inacessível ativa.
    const pane = document.getElementById('admin');
    if (pane && pane.classList.contains('active') && typeof goToTab === 'function') {
      goToTab('dash');
    }
  }
}

async function renderAdminTab() {
  if (typeof isAdmin !== 'function' || !isAdmin()) {
    // Segurança extra: mesmo que alguém force go('admin', ...) via console,
    // os containers ficam vazios pra quem não é o Eduardo.
    ['admin-stats-wrap', 'admin-tab-analytics-wrap', 'admin-product-clicks-wrap',
     'admin-set-distribution-wrap', 'admin-userlist-wrap', 'admin-feedback-wrap',
     'admin-updates-wrap', 'lojas-admin', 'mkt-pending-list', 'pc-pending-list']
      .forEach(function (id) { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    return;
  }

  if (typeof renderAdminStats === 'function') renderAdminStats();
  if (typeof renderAdminTabStats === 'function') renderAdminTabStats();
  if (typeof renderAdminProductClicks === 'function') renderAdminProductClicks();
  if (typeof renderAdminSetDistribution === 'function') renderAdminSetDistribution();
  if (typeof renderAdminUserList === 'function') renderAdminUserList();
  if (typeof renderAdminFeedback === 'function') renderAdminFeedback();
  if (typeof renderUpdatesAdminForm === 'function') renderUpdatesAdminForm();

  if (typeof loadMarketplaceData === 'function' && typeof renderStoreLists === 'function') {
    try { await loadMarketplaceData(); renderStoreLists(); } catch (e) { console.error('[admin] lojas confiáveis', e); }
  }
  if (typeof loadPositiveCompanies === 'function' && typeof renderPositiveLists === 'function') {
    try {
      await loadPositiveCompanies();
      if (typeof loadCompanyReviews === 'function') await loadCompanyReviews();
      renderPositiveLists();
    } catch (e) { console.error('[admin] cadastro positivo', e); }
  }
  if (typeof renderAdminPanel === 'function') renderAdminPanel();
}

(function hookAdminTabVisibility() {
  function tryHook() {
    if (typeof window._updateUserChip !== 'function') { setTimeout(tryHook, 50); return; }
    const original = window._updateUserChip;
    window._updateUserChip = function (user) {
      original(user);
      updateAdminTabVisibility();
    };
    // Cobre o caso de já estar logado quando este arquivo carrega.
    updateAdminTabVisibility();
  }
  tryHook();
})();
