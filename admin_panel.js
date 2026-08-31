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
  // ESPELHO 12/08/2026: mesmo toggle no botão "🔐 Admin" do menu desktop novo.
  const deskBtn = document.getElementById('desk-tab-admin');
  if (deskBtn) deskBtn.style.display = show ? '' : 'none';
  // ESPELHO 29/08/2026: mesmo toggle no item "Admin" dentro da folha "Mais"
  // do menu mobile novo (.msheet).
  const sheetBtn = document.getElementById('msheet-tab-admin');
  if (sheetBtn) sheetBtn.style.display = show ? '' : 'none';
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

// ================================================================
// Seções colapsáveis da aba Admin (23/08/2026)
// Pedido do Eduardo: cada bloco poder minimizar. Generaliza o mesmo
// padrão de header clicável + corpo escondido que lojas_admin_collapse.js
// já usa nos cards de produto — aqui aplicado à seção inteira (ver
// os wrappers .admin-section no index.html).
//
// Regra de abertura ao entrar na aba: se o Eduardo já decidiu manualmente
// pra essa seção (tem valor salvo no localStorage), respeita a escolha
// dele. Senão, abre sozinha só quem tiver pendência (badge > 0) — o
// resto nasce fechado. Os módulos que carregam pendências (feedback.js,
// marketplace.js, positivo.js) expõem a contagem em window.__adminXxx
// antes de renderAdminTab() chegar em applyAdminSectionStates().
// ================================================================

const ADMIN_SECTION_PENDING_VAR = {
  feedback: '__adminFeedbackUnread',
  marketplace: '__adminMktPending',
  positivo: '__adminPositivoPending'
};

function adminSectionStorageKey(key) { return 'admin_sec_open_' + key; }

function toggleAdminSection(key) {
  const el = document.getElementById('asec-' + key);
  if (!el) return;
  const open = !el.classList.contains('admin-sec-open');
  el.classList.toggle('admin-sec-open', open);
  try { localStorage.setItem(adminSectionStorageKey(key), open ? '1' : '0'); } catch (e) { /* localStorage indisponível — ignora */ }
}
window.toggleAdminSection = toggleAdminSection;

function setAdminSectionBadge(key, count) {
  const el = document.getElementById('asec-badge-' + key);
  if (!el) return;
  if (count > 0) {
    el.textContent = count;
    el.style.display = 'flex';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function applyAdminSectionStates() {
  document.querySelectorAll('.admin-section').forEach(function (el) {
    const key = el.id.replace(/^asec-/, '');
    const pendingVar = ADMIN_SECTION_PENDING_VAR[key];
    const pendingCount = pendingVar ? (window[pendingVar] || 0) : 0;
    setAdminSectionBadge(key, pendingCount);

    let stored = null;
    try { stored = localStorage.getItem(adminSectionStorageKey(key)); } catch (e) { /* ignora */ }
    const open = stored !== null ? stored === '1' : pendingCount > 0;
    el.classList.toggle('admin-sec-open', open);
  });
}

async function renderAdminTab() {
  if (typeof isAdmin !== 'function' || !isAdmin()) {
    // Segurança extra: mesmo que alguém force go('admin', ...) via console,
    // os containers ficam vazios pra quem não é o Eduardo.
    ['admin-stats-wrap', 'admin-tab-analytics-wrap', 'admin-product-redirects-wrap',
     'admin-set-distribution-wrap', 'admin-userlist-wrap', 'admin-feedback-wrap',
     'admin-updates-wrap', 'home-content-admin-wrap', 'lojas-admin', 'mkt-pending-list', 'pc-pending-list',
     'staff-access-wrap']
      .forEach(function (id) { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    return;
  }

  if (typeof renderStaffAccessPanel === 'function') renderStaffAccessPanel();
  if (typeof renderAdminStats === 'function') renderAdminStats();
  if (typeof renderAdminTabStats === 'function') renderAdminTabStats();
  if (typeof renderAdminProductRedirects === 'function') renderAdminProductRedirects();
  if (typeof renderAdminSetDistribution === 'function') renderAdminSetDistribution();
  if (typeof renderAdminUserList === 'function') renderAdminUserList();
  if (typeof renderAdminFeedback === 'function') renderAdminFeedback();
  if (typeof renderUpdatesAdminForm === 'function') renderUpdatesAdminForm();
  if (typeof renderHomeContentAdmin === 'function') renderHomeContentAdmin();

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

  applyAdminSectionStates();
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
