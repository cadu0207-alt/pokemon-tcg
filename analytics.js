// ================================================================
// MyDeck — Métricas de Uso (analytics.js)
// Criado 11/08/2026 a pedido do Eduardo: quais abas do site são mais
// acessadas, qual produto rastreado mais recebe clique rumo ao
// Mercado Livre (+ total geral de cliques), quem são os usuários mais
// ativos, e qual coleção o pessoal mais está montando.
//
// Depende de sbClient/currentUser/uid() (app.js) e isAdmin() (lojas.js).
// Precisa rodar analytics_setup.sql no Supabase antes de funcionar
// (cria tab_visits, ml_product_clicks e as funções admin_* usadas aqui).
// ================================================================

// Nomes amigáveis pra cada aba — bate com os ids dos <div class="pane">
// em index.html (o mesmo id passado pra go(id, el)).
const TAB_LABELS = {
  dash: '📊 Dashboard',
  fichario: '📚 Fichário',
  gastos: '💸 Gastos',
  cartas: '📈 Compra/Venda',
  preco: '💰 Preço Justo',
  lojas: '🛍️ Lojas & Ofertas',
  mercado: '🏪 Lojas Confiáveis',
  positivo: '✅ Cadastro Positivo',
  iniciantes: '🔰 Iniciantes',
  centralizacao: '🎯 Avaliação de Centralização',
  admin: '🔐 Admin'
};

// ── REGISTRO DE VISITA POR ABA ─────────────────────────────────────
async function logTabVisit(tabId) {
  if (!sbClient || typeof uid !== 'function') return;
  const userId = uid();
  if (!userId || !tabId) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    await sbClient.from('tab_visits').upsert(
      { user_id: userId, tab_id: tabId, visit_date: today },
      { onConflict: 'user_id,tab_id,visit_date', ignoreDuplicates: true }
    );
  } catch (e) { /* silencioso — analytics nunca deve travar navegação */ }
}

// ── REGISTRO DE CLIQUE EM PRODUTO (rumo ao Mercado Livre) ──────────
// Chamado pelo onclick do card em lojas.js/renderProductCard. Dispara
// e deixa o link abrir normalmente — não bloqueia a navegação.
function logProductClick(termId) {
  if (!sbClient || typeof uid !== 'function' || !termId) return;
  const userId = uid();
  if (!userId) return;
  sbClient.from('ml_product_clicks').insert({ term_id: termId, user_id: userId }).then(function(){}, function(){});
}

// ── PAINEL ADMIN: ABAS MAIS ACESSADAS ───────────────────────────────
function barRowHtml(label, value, maxValue, extra) {
  const pct = maxValue > 0 ? Math.max(4, Math.round((value / maxValue) * 100)) : 0;
  return (
    '<div class="admin-bar-row">' +
      '<div class="admin-bar-lbl">' + label + '</div>' +
      '<div class="admin-bar-track"><div class="admin-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="admin-bar-val">' + value + (extra ? ' <span style="opacity:.6">' + extra + '</span>' : '') + '</div>' +
    '</div>'
  );
}

async function renderAdminTabStats() {
  const holder = document.getElementById('admin-tab-analytics-wrap');
  if (!holder) return;
  if (typeof isAdmin !== 'function' || !isAdmin()) { holder.innerHTML = ''; return; }

  holder.innerHTML = '<div class="admin-stats-loading">Carregando abas mais acessadas...</div>';

  const { data, error } = await sbClient.rpc('admin_tab_stats', { days: 30 });
  if (error) {
    holder.innerHTML =
      '<div class="sec-title" style="margin-top:28px">📍 Abas Mais Acessadas</div>' +
      '<div class="admin-stats-loading">Erro ao carregar — rodou o analytics_setup.sql no Supabase? (' + error.message + ')</div>';
    return;
  }

  const rows = (data || []).slice().sort(function(a, b) { return b.total - a.total; });
  if (!rows.length) {
    holder.innerHTML =
      '<div class="sec-title" style="margin-top:28px">📍 Abas Mais Acessadas</div>' +
      '<div class="admin-stats-loading">Ainda sem dados — vai se preenchendo conforme o pessoal navega pelas abas.</div>';
    return;
  }

  const maxTotal = Math.max.apply(null, rows.map(function(r) { return r.total; }));
  const barsHtml = rows.map(function(r) {
    const label = TAB_LABELS[r.tab_id] || r.tab_id;
    return barRowHtml(label, r.total, maxTotal, r.recent + ' nos últ. 30d · ' + r.unique_users + ' usuário(s)');
  }).join('');

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:28px">📍 Abas Mais Acessadas</div>' +
    '<div class="admin-stats-loading" style="margin-bottom:10px">Contagem por usuário logado, 1x por dia por aba — a partir de 11/08/2026.</div>' +
    '<div class="admin-bars">' + barsHtml + '</div>';
}

// ── PAINEL ADMIN: PRODUTOS MAIS CLICADOS (Mercado Livre) ───────────
async function renderAdminProductClicks() {
  const holder = document.getElementById('admin-product-clicks-wrap');
  if (!holder) return;
  if (typeof isAdmin !== 'function' || !isAdmin()) { holder.innerHTML = ''; return; }

  holder.innerHTML = '<div class="admin-stats-loading">Carregando cliques...</div>';

  const { data, error } = await sbClient.rpc('admin_product_click_stats', { days: 30 });
  if (error) {
    holder.innerHTML =
      '<div class="sec-title" style="margin-top:28px">🛒 Cliques rumo ao Mercado Livre</div>' +
      '<div class="admin-stats-loading">Erro ao carregar — rodou o analytics_setup.sql no Supabase? (' + error.message + ')</div>';
    return;
  }

  const s = data || {};
  const items = (s.items || []).slice(0, 15);

  const totalsHtml =
    '<div class="admin-stats-grid" style="margin-bottom:14px">' +
      '<div class="admin-stat-card"><div class="admin-stat-value">' + (s.total_clicks ?? 0) + '</div><div class="admin-stat-label">Cliques totais p/ ML</div></div>' +
      '<div class="admin-stat-card"><div class="admin-stat-value">' + (s.total_clicks_recent ?? 0) + '</div><div class="admin-stat-label">Cliques (30 dias)</div></div>' +
    '</div>';

  if (!items.length) {
    holder.innerHTML =
      '<div class="sec-title" style="margin-top:28px">🛒 Cliques rumo ao Mercado Livre</div>' +
      totalsHtml +
      '<div class="admin-stats-loading">Nenhum clique registrado ainda.</div>';
    return;
  }

  const maxClicks = Math.max.apply(null, items.map(function(i) { return i.clicks; }));
  const barsHtml = items.map(function(i) {
    const label = (i.label || 'produto removido') + (i.collection ? ' <span style="opacity:.55">· ' + i.collection + '</span>' : '');
    return barRowHtml(label, i.clicks, maxClicks, i.clicks_recent + ' nos últ. 30d');
  }).join('');

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:28px">🛒 Cliques rumo ao Mercado Livre</div>' +
    totalsHtml +
    '<div class="admin-bars">' + barsHtml + '</div>';
}

// ── PAINEL ADMIN: DISTRIBUIÇÃO POR COLEÇÃO/SET ─────────────────────
async function renderAdminSetDistribution() {
  const holder = document.getElementById('admin-set-distribution-wrap');
  if (!holder) return;
  if (typeof isAdmin !== 'function' || !isAdmin()) { holder.innerHTML = ''; return; }

  holder.innerHTML = '<div class="admin-stats-loading">Carregando coleções...</div>';

  const { data, error } = await sbClient.rpc('admin_set_distribution');
  if (error) {
    holder.innerHTML =
      '<div class="sec-title" style="margin-top:28px">📚 Coleções Mais Montadas</div>' +
      '<div class="admin-stats-loading">Erro ao carregar — rodou o analytics_setup.sql no Supabase? (' + error.message + ')</div>';
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    holder.innerHTML =
      '<div class="sec-title" style="margin-top:28px">📚 Coleções Mais Montadas</div>' +
      '<div class="admin-stats-loading">Nenhuma carta marcada ainda.</div>';
    return;
  }

  const maxCollectors = Math.max.apply(null, rows.map(function(r) { return r.collectors; }));
  const barsHtml = rows.map(function(r) {
    return barRowHtml(r.set_id, r.collectors, maxCollectors, r.cards_marked + ' carta(s) marcada(s)');
  }).join('');

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:28px">📚 Coleções Mais Montadas <span style="opacity:.6;font-size:11px">(por nº de colecionadores)</span></div>' +
    '<div class="admin-bars">' + barsHtml + '</div>';
}

// ── PAINEL ADMIN: USUÁRIOS ──────────────────────────────────────────
async function renderAdminUserList() {
  const holder = document.getElementById('admin-userlist-wrap');
  if (!holder) return;
  if (typeof isAdmin !== 'function' || !isAdmin()) { holder.innerHTML = ''; return; }

  holder.innerHTML = '<div class="admin-stats-loading">Carregando usuários...</div>';

  const { data, error } = await sbClient.rpc('admin_list_users');
  if (error) {
    holder.innerHTML =
      '<div class="sec-title" style="margin-top:28px">👥 Usuários</div>' +
      '<div class="admin-stats-loading">Erro ao carregar — rodou o analytics_setup.sql no Supabase? (' + error.message + ')</div>';
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    holder.innerHTML = '<div class="sec-title" style="margin-top:28px">👥 Usuários</div><div class="admin-stats-loading">Nenhum usuário ainda.</div>';
    return;
  }

  const rowsHtml = rows.map(function(u) {
    const signup = u.signed_up_at ? new Date(u.signed_up_at).toLocaleDateString('pt-BR') : '-';
    const lastSeen = u.last_seen ? new Date(u.last_seen).toLocaleDateString('pt-BR') : 'nunca voltou';
    return (
      '<tr>' +
        '<td>' + (u.email || '(sem e-mail)') + '</td>' +
        '<td>' + signup + '</td>' +
        '<td>' + lastSeen + '</td>' +
        '<td>' + (u.cards_collected ?? 0) + '</td>' +
        '<td>' + (u.purchases_count ?? 0) + '</td>' +
      '</tr>'
    );
  }).join('');

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:28px">👥 Usuários <span style="opacity:.6;font-size:11px">(' + rows.length + ')</span></div>' +
    '<input id="admin-userlist-search" placeholder="🔎 Filtrar por e-mail..." style="width:100%;box-sizing:border-box;margin:8px 0 12px;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text)" oninput="filterAdminUserList(this.value)">' +
    '<div style="overflow-x:auto"><table class="admin-users-table" id="admin-users-table">' +
      '<thead><tr><th>E-mail</th><th>Cadastro</th><th>Última visita</th><th>Cartas</th><th>Compras</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table></div>';
}

function filterAdminUserList(query) {
  const q = (query || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#admin-users-table tbody tr');
  rows.forEach(function(tr) {
    const email = (tr.children[0] && tr.children[0].textContent || '').toLowerCase();
    tr.style.display = (!q || email.indexOf(q) !== -1) ? '' : 'none';
  });
}

// ── HOOKS ────────────────────────────────────────────────────────
(function hookAnalyticsIntoApp() {
  function tryHook() {
    if (typeof window.go !== 'function') { setTimeout(tryHook, 50); return; }
    const originalGo = window.go;
    window.go = function (id, el) {
      originalGo(id, el);
      logTabVisit(id);
    };
  }
  tryHook();
})();
