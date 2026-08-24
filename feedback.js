// ================================================================
// MyDeck — Feedback rápido de usuários (feedback.js)
// Barra "site em construção, queremos sua opinião" com botão de
// enviar (aparece pra qualquer usuário logado, embaixo do header) +
// painel admin na aba Dashboard listando as mensagens recebidas com
// opção de responder. Depende de sbClient/currentUser/uid() (app.js)
// e isAdmin() (lojas.js), então precisa carregar depois dos dois.
// ================================================================

// ── BARRA DE FEEDBACK (todo usuário logado vê) ──────────────────
async function renderFeedbackBar() {
  const holder = document.getElementById('feedback-bar-wrap');
  if (!holder || !sbClient || !currentUser) return;

  // Confere se tem alguma resposta do admin ainda não vista.
  const { data: mine, error } = await sbClient
    .from('feedback_messages')
    .select('*')
    .eq('user_id', uid())
    .not('reply', 'is', null)
    .eq('ack', false)
    .order('replied_at', { ascending: false })
    .limit(1);

  if (!error && mine && mine.length) {
    const r = mine[0];
    holder.innerHTML =
      '<div class="feedback-reply-bar">' +
        '<span>💬 <strong>Eduardo respondeu sua mensagem:</strong> "' + r.reply + '"</span>' +
        '<button class="btn-mini" onclick="ackFeedbackReply(' + r.id + ')">OK, entendi</button>' +
      '</div>';
    return;
  }

  holder.innerHTML =
    '<div class="feedback-bar">' +
      '<span class="feedback-bar-text">💬 Fale com o MyDeck — queremos sua opinião</span>' +
      '<input id="feedback-input" class="feedback-input" placeholder="Digite sua sugestão, dúvida ou problema..." maxlength="500">' +
      '<button class="feedback-send-btn" id="feedback-send-btn" onclick="sendFeedback()" title="Enviar mensagem">📨</button>' +
    '</div>';
}

async function sendFeedback() {
  const input = document.getElementById('feedback-input');
  const btn = document.getElementById('feedback-send-btn');
  if (!input || !sbClient || !currentUser) return;
  const message = input.value.trim();
  if (!message) return;

  btn.disabled = true;
  const { error } = await sbClient.from('feedback_messages').insert({ user_id: uid(), message });
  btn.disabled = false;

  const holder = document.getElementById('feedback-bar-wrap');
  if (error) {
    if (holder) holder.innerHTML = '<div class="feedback-bar">⚠️ Não consegui enviar: ' + error.message + '</div>';
    return;
  }
  if (holder) holder.innerHTML = '<div class="feedback-bar feedback-bar-sent">✅ Obrigado! Sua mensagem foi enviada.</div>';
  setTimeout(renderFeedbackBar, 3500);
}

async function ackFeedbackReply(id) {
  if (!sbClient) return;
  await sbClient.from('feedback_messages').update({ ack: true }).eq('id', id);
  renderFeedbackBar();
}

// ── PAINEL ADMIN (só o Eduardo vê, na aba Dashboard) ────────────
async function renderAdminFeedback() {
  const holder = document.getElementById('admin-feedback-wrap');
  if (!holder) return;
  if (typeof isAdmin !== 'function' || !isAdmin()) { holder.innerHTML = ''; return; }

  holder.innerHTML = '<div class="admin-stats-loading">💬 Carregando mensagens...</div>';

  const { data, error } = await sbClient.rpc('admin_list_feedback');
  if (error) {
    holder.innerHTML = '<div class="admin-stats-loading">⚠️ Erro ao carregar mensagens: ' + error.message + '</div>';
    return;
  }

  const list = data || [];
  // Badge de pendência na seção da aba Admin (admin_panel.js/applyAdminSectionStates)
  window.__adminFeedbackUnread = list.filter(function (m) { return !m.reply; }).length;

  if (!list.length) {
    holder.innerHTML = '<div class="admin-stats-loading">Nenhuma mensagem recebida ainda.</div>';
    return;
  }

  const itemsHtml = list.map(m => {
    const dt = m.created_at ? new Date(m.created_at).toLocaleString('pt-BR') : '';
    const replyDt = m.replied_at ? new Date(m.replied_at).toLocaleString('pt-BR') : '';
    return (
      '<div class="feedback-msg-card">' +
        '<div class="feedback-msg-hdr">' +
          '<span class="feedback-msg-user">👤 ' + (m.user_email || 'usuário') + '</span>' +
          '<span class="feedback-msg-date">' + dt + '</span>' +
        '</div>' +
        '<div class="feedback-msg-text">' + m.message + '</div>' +
        (m.reply
          ? '<div class="feedback-msg-reply"><strong>Sua resposta</strong> (' + replyDt + '): ' + m.reply + '</div>'
          : '') +
        '<div class="feedback-reply-row">' +
          '<input id="reply-input-' + m.id + '" placeholder="' + (m.reply ? 'Atualizar resposta...' : 'Responder pro usuário...') + '" value="">' +
          '<button class="btn-mini" onclick="sendFeedbackReply(' + m.id + ')">Enviar resposta</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  holder.innerHTML = '<div class="feedback-msg-list">' + itemsHtml + '</div>';
}

async function sendFeedbackReply(id) {
  if (typeof hasPerm !== 'function' || !hasPerm('feedback')) return;
  const input = document.getElementById('reply-input-' + id);
  if (!input) return;
  const replyText = input.value.trim();
  if (!replyText) { alert('Escreva uma resposta antes de enviar.'); return; }

  const { error } = await sbClient.rpc('admin_reply_feedback', { msg_id: id, reply_text: replyText });
  if (error) { alert('Erro ao enviar resposta: ' + error.message); return; }
  renderAdminFeedback();
}

// ── HOOKS ────────────────────────────────────────────────────────
// Encadeia no _updateUserChip (app.js) pra mostrar a barra assim que
// o usuário loga, e no go() (app.js/lojas.js/iniciantes.js já fazem
// o mesmo pra suas próprias abas) pra recarregar o painel admin toda
// vez que a aba Dashboard é aberta.
(function hookFeedbackIntoApp() {
  const tryHook = () => {
    if (typeof window._updateUserChip !== 'function' || typeof window.go !== 'function') {
      setTimeout(tryHook, 50);
      return;
    }
    const originalUpdateChip = window._updateUserChip;
    window._updateUserChip = function (user) {
      originalUpdateChip(user);
      if (user) renderFeedbackBar(); else {
        const holder = document.getElementById('feedback-bar-wrap');
        if (holder) holder.innerHTML = '';
      }
    };
    // ADMIN 11/08/2026: renderAdminFeedback() não roda mais ao abrir o
    // Dashboard — agora só roda quando a aba Admin abre (admin_panel.js).
  };
  tryHook();
})();
