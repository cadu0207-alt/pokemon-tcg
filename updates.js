// ================================================================
// MyDeck — Log de Atualizações (updates.js)
// Mural de novidades exibido no Dashboard: todo usuário vê as últimas
// mensagens publicadas pelo admin (Eduardo); só o admin vê o formulário
// pra publicar/apagar. Depende de sbClient/currentUser/uid() (app.js)
// e isAdmin() (lojas.js), então precisa carregar depois dos dois.
// ================================================================

async function renderUpdatesLog() {
  const holder = document.getElementById('updates-log-wrap');
  if (!holder || !sbClient || !currentUser) return;

  holder.innerHTML =
    '<div class="updates-log-card">' +
      '<div class="updates-log-hdr">' +
        '<div class="sec-title" style="margin-top:0">📢 Atualizações</div>' +
        // CORRIGIDO 02/08/2026: botão do WhatsApp saiu daqui — agora vive no
        // grupo de ações fixas do topo (.top-fixed-actions, index.html),
        // maior e ao lado do botão de tema, não escondido dentro do card
        // de Atualizações.
        '<div class="updates-log-hdr-actions">' +
          '<button class="update-minimize-btn" title="Minimizar" onclick="toggleUpdatesLogCollapse()">−</button>' +
        '</div>' +
      '</div>' +
      // ADMIN 11/08/2026: o formulário de publicar (só admin via) saiu daqui
      // e virou renderUpdatesAdminForm(), na aba Admin (#admin-updates-wrap).
      // O log em si (com botão de apagar por item, pra quem é admin) continua
      // público no Dashboard — é conteúdo que todo usuário vê mesmo.
      '<div class="updates-log-list" id="updates-log-list">Carregando...</div>' +
    '</div>' +
    '<div class="updates-log-collapsed-btn" onclick="toggleUpdatesLogCollapse()" title="Ver atualizações">✉️ Mensagens e Atualizações</div>';

  // Restaura o estado (aberto/minimizado) salvo da última visita — padrão é
  // minimizado (CORRIGIDO 12/08/2026: começar aberto cobria a tela toda de
  // primeira; agora só o "envelope" no canto, igual era antes do card ficar
  // maior por causa das novas seções).
  let wasCollapsed = true;
  try {
    const saved = localStorage.getItem('updatesLogCollapsed');
    if (saved !== null) wasCollapsed = saved === '1';
  } catch (e) {}
  holder.classList.toggle('updates-log-collapsed', wasCollapsed);

  await loadUpdatesList();
}

// ── PAINEL ADMIN — publicar atualização (aba Admin) ────────────────
function renderUpdatesAdminForm() {
  const holder = document.getElementById('admin-updates-wrap');
  if (!holder) return;
  if (typeof isAdmin !== 'function' || !isAdmin()) { holder.innerHTML = ''; return; }

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:28px">📢 Admin · Publicar Atualização</div>' +
    '<div class="update-admin-form">' +
      '<input id="update-title-input" placeholder="Título (ex: Nova feature)" maxlength="80">' +
      '<textarea id="update-msg-input" placeholder="O que mudou..." maxlength="400"></textarea>' +
      '<button class="btn-mini" id="update-publish-btn" onclick="publishUpdate()">📨 Publicar</button>' +
    '</div>';
}

// CORRIGIDO 02/08/2026: o painel ficava sobrepondo a barra de abas em telas
// largas (top:130px fixo no CSS não batia com a altura real do header —
// varia com o conteúdo do lado direito, ex. badge de XP/tema). Em vez de
// chutar um pixel novo, mede a posição real do fim da .tabs (que já é
// sticky, então getBoundingClientRect().bottom reflete onde ela realmente
// "gruda" na tela) e escreve isso numa CSS var que o .updates-log-panel usa.
function positionUpdatesLogPanel() {
  const tabs = document.querySelector('.tabs');
  if (!tabs) return;
  const top = Math.ceil(tabs.getBoundingClientRect().bottom) + 14;
  document.documentElement.style.setProperty('--updates-log-top', top + 'px');
}
(function watchUpdatesLogPosition() {
  window.addEventListener('resize', () => positionUpdatesLogPanel());
  window.addEventListener('load', () => setTimeout(positionUpdatesLogPanel, 300));
  // Recalcula de novo um pouco depois do primeiro render — cobre o caso do
  // badge de XP/status do usuário carregar de forma assíncrona e mudar a
  // altura do header depois do primeiro cálculo.
  setTimeout(positionUpdatesLogPanel, 1200);
})();

function toggleUpdatesLogCollapse(forceState) {
  const holder = document.getElementById('updates-log-wrap');
  if (!holder) return;
  const collapsed = typeof forceState === 'boolean' ? forceState : !holder.classList.contains('updates-log-collapsed');
  holder.classList.toggle('updates-log-collapsed', collapsed);
  try { localStorage.setItem('updatesLogCollapsed', collapsed ? '1' : '0'); } catch (e) {}
}

async function loadUpdatesList() {
  const list = document.getElementById('updates-log-list');
  if (!list) return;

  const { data, error } = await sbClient
    .from('site_updates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(8);

  if (error) {
    list.innerHTML = '<div class="admin-stats-loading">Erro ao carregar: ' + error.message + '</div>';
    return;
  }

  const rows = data || [];
  if (!rows.length) {
    list.innerHTML = '<div class="admin-stats-loading">Nenhuma atualização publicada ainda.</div>';
    return;
  }

  const admin = typeof isAdmin === 'function' && isAdmin();

  list.innerHTML = rows.map(function (u) {
    const dt = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '';
    return (
      '<div class="update-item">' +
        '<div class="update-item-hdr">' +
          '<span class="update-item-title">🆕 ' + u.title + '</span>' +
          '<span class="update-item-date">' + dt +
            (admin ? ' <button class="update-item-del" title="Apagar" onclick="deleteUpdate(' + u.id + ')">✕</button>' : '') +
          '</span>' +
        '</div>' +
        '<div class="update-item-text">' + u.message + '</div>' +
      '</div>'
    );
  }).join('');
}

async function publishUpdate() {
  if (typeof isAdmin !== 'function' || !isAdmin()) return;
  const titleInput = document.getElementById('update-title-input');
  const msgInput = document.getElementById('update-msg-input');
  const btn = document.getElementById('update-publish-btn');
  if (!titleInput || !msgInput) return;

  const title = titleInput.value.trim();
  const message = msgInput.value.trim();
  if (!title || !message) { alert('Preencha título e mensagem antes de publicar.'); return; }

  btn.disabled = true;
  const { error } = await sbClient.from('site_updates').insert({ title, message });
  btn.disabled = false;

  if (error) { alert('Erro ao publicar: ' + error.message); return; }

  titleInput.value = '';
  msgInput.value = '';
  loadUpdatesList();
}

async function deleteUpdate(id) {
  if (typeof isAdmin !== 'function' || !isAdmin()) return;
  if (!confirm('Apagar essa atualização?')) return;
  const { error } = await sbClient.from('site_updates').delete().eq('id', id);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  loadUpdatesList();
}

// ── HOOKS ────────────────────────────────────────────────────────
(function hookUpdatesIntoApp() {
  const tryHook = () => {
    if (typeof window._updateUserChip !== 'function' || typeof window.go !== 'function') {
      setTimeout(tryHook, 50);
      return;
    }
    const originalUpdateChip = window._updateUserChip;
    window._updateUserChip = function (user) {
      originalUpdateChip(user);
      if (user) renderUpdatesLog(); else {
        const holder = document.getElementById('updates-log-wrap');
        if (holder) holder.innerHTML = '';
      }
    };
    const originalGo = window.go;
    window.go = function (id, el) {
      originalGo(id, el);
      if (id === 'dash' && typeof renderUpdatesLog === 'function') renderUpdatesLog();
    };
  };
  tryHook();
})();
