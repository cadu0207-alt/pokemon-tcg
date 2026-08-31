// ================================================================
// MyDeck — Acesso da Equipe (staff_access.js)
// Criado 21/08/2026 a pedido do Eduardo: dar visualização total da aba
// Admin pro Caio e pro André, sem que eles editem nada por padrão, e uma
// telinha (dentro da própria aba Admin) onde o Eduardo marca, pessoa por
// pessoa, quais ações específicas cada um pode fazer.
//
// Depende de sbClient, currentUser, uid(), isAdminEditor() (lojas.js) já
// definidos — precisa carregar depois de lojas.js e antes de
// admin_panel.js (que chama renderStaffAccessPanel dentro de renderAdminTab).
//
// Back-end: ver staff_access_setup.sql (tabela staff_access + RPCs
// get_my_staff_access/add_staff_member/set_staff_permissions/
// remove_staff_member + policies adicionais nas tabelas de cada área).
//
// Áreas com permissão granular hoje: lojas, feedback, marketplace,
// positivo, updates, inicio, leilao (visualização geral, adicionada
// 29/08/2026 — dá pra ver tudo no Leilão/Loja do Leiloeiro, mas não
// edita/exclui carta ou pedido de outro leiloeiro).
// ================================================================

window.__staffPerms = [];
window.__isStaffMember = false;

const STAFF_AREAS = [
  { key: 'lojas', label: '🛒 Lojas & Ofertas', hint: 'cadastrar/editar produtos rastreados, cupons, coleção, destaque, atualizar preços (não mexe no link de afiliado)' },
  { key: 'feedback', label: '💬 Feedback', hint: 'responder mensagens de usuários' },
  { key: 'marketplace', label: '🏪 Lojas Confiáveis', hint: 'aprovar/rejeitar cadastro de lojas (não edita CNPJ/comissão)' },
  { key: 'positivo', label: '✅ Cadastro Positivo', hint: 'aprovar/rejeitar indicações de lojas' },
  { key: 'updates', label: '📢 Atualizações', hint: 'publicar no mural de novidades (apagar continua só do Eduardo)' },
  { key: 'inicio', label: '🏠 Início', hint: 'publicar notícias, vídeos da comunidade, links úteis e artigos da Revista MyDeck na aba Início' },
  { key: 'leilao', label: '🏆 Leilão (visualização geral)', hint: '29/08/2026 — ver TODAS as cartas, pedidos, valores e comissão de TODOS os leiloeiros (igual o Eduardo enxerga) — não libera editar/excluir carta ou pedido de outro leiloeiro, isso continua só de quem cadastrou' }
];

async function loadMyStaffAccess() {
  window.__isStaffMember = false;
  window.__staffPerms = [];
  if (!uid() || (typeof isAdminEditor === 'function' && isAdminEditor())) return; // Eduardo não precisa disso
  try {
    const { data, error } = await sbClient.rpc('get_my_staff_access');
    if (error) { console.error('[staff_access] get_my_staff_access', error); return; }
    if (data && data.is_staff) {
      window.__isStaffMember = true;
      window.__staffPerms = data.permissions || [];
    }
  } catch (e) {
    console.error('[staff_access] get_my_staff_access', e);
  }
}

// hasPerm('lojas') → true pro Eduardo sempre, ou pra quem tem essa área
// marcada em staff_access.permissions. Use isso (em vez de isAdminEditor
// puro) nas ações que a equipe pode ganhar permissão de fazer.
function hasPerm(area) {
  if (typeof isAdminEditor === 'function' && isAdminEditor()) return true;
  return window.__staffPerms.indexOf(area) !== -1;
}
window.hasPerm = hasPerm;

// ── PAINEL DE GESTÃO (só o Eduardo vê e mexe) ──────────────────────
async function renderStaffAccessPanel() {
  const holder = document.getElementById('staff-access-wrap');
  if (!holder) return;
  if (typeof isAdminEditor !== 'function' || !isAdminEditor()) { holder.innerHTML = ''; return; }

  holder.innerHTML = '<div class="admin-stats-loading">Carregando equipe...</div>';

  const { data, error } = await sbClient
    .from('staff_access')
    .select('uid,email,display_name,permissions,created_at')
    .order('created_at', { ascending: true });

  if (error) {
    holder.innerHTML =
      '<div class="admin-stats-loading">Erro ao carregar — rodou o staff_access_setup.sql no Supabase? (' + error.message + ')</div>';
    return;
  }

  const rows = data || [];

  const rowsHtml = rows.map(function (s) {
    const checks = STAFF_AREAS.map(function (a) {
      const checked = (s.permissions || []).indexOf(a.key) !== -1 ? ' checked' : '';
      return (
        '<label class="staff-perm-check" title="' + a.hint + '">' +
          '<input type="checkbox" data-uid="' + s.uid + '" data-area="' + a.key + '"' + checked + '> ' + a.label +
        '</label>'
      );
    }).join('');
    return (
      '<div class="ml-term-card" data-staff-row="' + s.uid + '">' +
        '<div class="ml-term-hdr">' +
          '<span class="ml-term-name">👤 ' + (s.display_name || s.email) + '</span>' +
          '<span class="ml-term-actions">' +
            '<button class="btn-mini" onclick="saveStaffPermissions(\'' + s.uid + '\')">Salvar permissões</button>' +
            '<button class="btn-mini btn-mini-danger" onclick="removeStaffMember(\'' + s.uid + '\')">Remover</button>' +
          '</span>' +
        '</div>' +
        '<div class="ml-term-sub">' + s.email + ' · vê tudo na aba Admin' + ((s.permissions || []).length ? '' : ' (só visualização — nenhuma permissão marcada)') + '</div>' +
        '<div class="staff-perm-grid">' + checks + '</div>' +
      '</div>'
    );
  }).join('');

  holder.innerHTML =
    '<div class="ml-add-hint">Adicione pelo e-mail que a pessoa usa pra logar no site (Google) — ela precisa ter feito login pelo menos uma vez antes. Por padrão ela só VISUALIZA a aba Admin; marque as caixinhas abaixo pra liberar ações específicas.</div>' +
    '<div class="ml-add-term">' +
      '<input id="staff-add-email" placeholder="email@exemplo.com">' +
      '<input id="staff-add-name" placeholder="Nome (opcional)">' +
      '<button class="btn-add" onclick="addStaffMemberClick()">+ ADICIONAR À EQUIPE</button>' +
    '</div>' +
    '<div id="staff-add-status" style="font-size:11px;color:var(--muted);margin-top:4px"></div>' +
    '<div class="ml-terms-list" style="margin-top:12px">' +
      (rows.length ? rowsHtml : '<div class="ml-loading">Ninguém adicionado ainda.</div>') +
    '</div>';
}

async function addStaffMemberClick() {
  if (typeof isAdminEditor !== 'function' || !isAdminEditor()) return;
  const emailEl = document.getElementById('staff-add-email');
  const nameEl = document.getElementById('staff-add-name');
  const statusEl = document.getElementById('staff-add-status');
  const email = (emailEl && emailEl.value || '').trim();
  if (!email) { if (statusEl) statusEl.textContent = 'Digite um e-mail.'; return; }

  if (statusEl) statusEl.textContent = 'Adicionando...';
  const { error } = await sbClient.rpc('add_staff_member', {
    p_email: email,
    p_display_name: (nameEl && nameEl.value || '').trim() || null
  });

  if (error) {
    if (statusEl) {
      statusEl.textContent = error.message === 'user_not_found'
        ? 'Essa pessoa ainda não fez login no site nenhuma vez — peça pra ela entrar em mydecktcg.com.br pelo menos uma vez e tente de novo.'
        : 'Erro: ' + error.message;
    }
    return;
  }

  if (emailEl) emailEl.value = '';
  if (nameEl) nameEl.value = '';
  if (statusEl) statusEl.textContent = '✓ Adicionado — visualização liberada, sem nenhuma permissão de edição ainda.';
  renderStaffAccessPanel();
}
window.addStaffMemberClick = addStaffMemberClick;

async function saveStaffPermissions(staffUid) {
  if (typeof isAdminEditor !== 'function' || !isAdminEditor()) return;
  const row = document.querySelector('[data-staff-row="' + staffUid + '"]');
  if (!row) return;
  const perms = Array.from(row.querySelectorAll('input[type=checkbox]:checked')).map(function (el) { return el.dataset.area; });

  const { error } = await sbClient.rpc('set_staff_permissions', { p_uid: staffUid, p_permissions: perms });
  if (error) { alert('Erro ao salvar permissões: ' + error.message); return; }
  renderStaffAccessPanel();
}
window.saveStaffPermissions = saveStaffPermissions;

async function removeStaffMember(staffUid) {
  if (typeof isAdminEditor !== 'function' || !isAdminEditor()) return;
  if (!confirm('Remover essa pessoa da equipe? Ela perde acesso à aba Admin (visualização e edição).')) return;
  const { error } = await sbClient.rpc('remove_staff_member', { p_uid: staffUid });
  if (error) { alert('Erro ao remover: ' + error.message); return; }
  renderStaffAccessPanel();
}
window.removeStaffMember = removeStaffMember;

// ── HOOKS ────────────────────────────────────────────────────────
// Encadeia no _updateUserChip (app.js), igual admin_panel.js — mas
// precisa carregar ANTES dele pra loadMyStaffAccess() já ter rodado
// quando updateAdminTabVisibility()/renderAdminTab() forem chamados.
(function hookStaffAccess() {
  function tryHook() {
    if (typeof window._updateUserChip !== 'function') { setTimeout(tryHook, 50); return; }
    const original = window._updateUserChip;
    window._updateUserChip = function (user) {
      original(user);
      loadMyStaffAccess().then(function () {
        if (typeof updateAdminTabVisibility === 'function') updateAdminTabVisibility();
        const pane = document.getElementById('admin');
        if (pane && pane.classList.contains('active') && typeof renderAdminTab === 'function') renderAdminTab();
      });
    };
    if (currentUser) loadMyStaffAccess();
  }
  tryHook();
})();
