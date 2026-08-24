// ================================================================
// MyDeck — Aba "🏠 Início" (inicio.js)
// Criado 23/08/2026 a pedido do Eduardo: primeira aba do menu, com
// Novidades do MyDeck (reaproveita site_updates), Notícias do Mundo
// Pokémon (registro simples — não é artigo, mídia opcional, comentários
// abertos, visualizações só pra admin), Vídeos da Comunidade (TikTok/
// YouTube), Links Úteis e a Revista MyDeck (artigos de verdade).
//
// Publicação de notícias/vídeos/links/artigos acontece só na aba Admin
// (ver home_content_admin.js) por quem tem hasPerm('inicio')
// (staff_access.js). Aqui é só leitura + comentários, abertos a
// qualquer usuário logado.
//
// Depende de sbClient/currentUser/uid() (app.js) e hasPerm() (staff_
// access.js) já definidos — carrega depois dos dois. Back-end: ver
// home_content_setup.sql (tabelas pokemon_news/pokemon_news_views/
// pokemon_news_comments/community_videos/community_links/
// magazine_articles + RPCs fn_register_news_view/fn_news_view_counts).
// ================================================================

const INICIO_MEDIA_LABEL = { image: '🖼 imagem', video: '🎥 vídeo', none: '' };

async function renderInicio() {
  if (!sbClient || !currentUser) return;
  renderInicioHero();
  loadInicioUpdates();
  loadInicioNews();
  loadInicioVideos();
  loadInicioLinks();
  loadInicioRevista();
}

// ── HERO — puxa o artigo em destaque da Revista ────────────────────
async function renderInicioHero() {
  const holder = document.getElementById('inicio-hero-wrap');
  if (!holder) return;

  const { data, error } = await sbClient
    .from('magazine_articles')
    .select('id,title,subtitle,tag,author_uid,published_at')
    .eq('is_featured', true)
    .order('published_at', { ascending: false })
    .limit(1);

  if (error || !data || !data.length) {
    holder.innerHTML = '';
    return;
  }

  const a = data[0];
  const dt = a.published_at ? new Date(a.published_at).toLocaleDateString('pt-BR') : '';
  holder.innerHTML =
    '<div class="inicio-hero">' +
      '<div class="inicio-hero-eyebrow">' + (a.tag || 'Destaque') + ' · Revista MyDeck</div>' +
      '<h2 class="inicio-hero-title">' + a.title + '</h2>' +
      (a.subtitle ? '<div class="inicio-hero-sub">' + a.subtitle + '</div>' : '') +
      '<div class="inicio-hero-meta">' + dt + '</div>' +
    '</div>';
}

// ── NOVIDADES DO MYDECK — reaproveita site_updates ──────────────────
async function loadInicioUpdates() {
  const holder = document.getElementById('inicio-updates-wrap');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient
    .from('site_updates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro ao carregar.</div>'; return; }

  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhuma novidade publicada ainda.</div>'; return; }

  holder.innerHTML = '<div class="inicio-shelf">' + rows.map(function (u) {
    const dt = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '';
    return (
      '<div class="inicio-update-card">' +
        '<div class="inicio-update-title">🆕 ' + u.title + '</div>' +
        '<div class="inicio-update-date">' + dt + '</div>' +
      '</div>'
    );
  }).join('') + '</div>';
}

// ── NOTÍCIAS DO MUNDO POKÉMON — registro simples, não é artigo ─────
async function loadInicioNews() {
  const holder = document.getElementById('inicio-news-wrap');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient
    .from('pokemon_news')
    .select('id,body,media_type,media_url,author_uid,published_at')
    .order('published_at', { ascending: false })
    .limit(15);

  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro ao carregar notícias.</div>'; return; }

  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhuma notícia publicada ainda.</div>'; return; }

  const ids = rows.map(function (r) { return r.id; });

  // Comentários — contagem por notícia (aberto a todo mundo ver o total).
  let commentCounts = {};
  try {
    const { data: cdata } = await sbClient.from('pokemon_news_comments').select('news_id').in('news_id', ids);
    (cdata || []).forEach(function (c) { commentCounts[c.news_id] = (commentCounts[c.news_id] || 0) + 1; });
  } catch (e) { /* silencioso — comentário é só decoração aqui */ }

  holder.innerHTML = '<div class="inicio-news-grid">' + rows.map(function (n) {
    const dt = n.published_at ? new Date(n.published_at).toLocaleDateString('pt-BR') : '';
    const mediaTag = INICIO_MEDIA_LABEL[n.media_type] || '';
    const mediaBlock = n.media_type === 'image' && n.media_url
      ? '<img class="inicio-news-media" src="' + n.media_url + '" alt="">'
      : n.media_type === 'video' && n.media_url
        ? '<a class="inicio-news-media inicio-news-video-link" href="' + n.media_url + '" target="_blank" rel="noopener">▶ Assistir vídeo</a>'
        : '';
    const commentN = commentCounts[n.id] || 0;
    return (
      '<div class="inicio-news-card" data-news-id="' + n.id + '">' +
        (mediaTag ? '<div class="inicio-news-tag">' + mediaTag + '</div>' : '') +
        mediaBlock +
        '<div class="inicio-news-body">' + n.body + '</div>' +
        '<div class="inicio-news-foot">' +
          '<span class="inicio-news-date">' + dt + '</span>' +
          '<span class="inicio-news-comment-toggle" onclick="toggleInicioComments(\'' + n.id + '\')">💬 ' + commentN + ' comentário' + (commentN === 1 ? '' : 's') + '</span>' +
        '</div>' +
        '<div class="inicio-comments" id="inicio-comments-' + n.id + '" style="display:none"></div>' +
      '</div>'
    );
  }).join('') + '</div>';

  // Registra visualização (1x por usuário) pra cada notícia que acabou de
  // aparecer na tela — silencioso, admin lê a soma via fn_news_view_counts.
  ids.forEach(function (id) {
    sbClient.rpc('fn_register_news_view', { p_news_id: id }).then(function () {}, function () {});
  });
}

async function toggleInicioComments(newsId) {
  const holder = document.getElementById('inicio-comments-' + newsId);
  if (!holder) return;
  const opening = holder.style.display === 'none';
  holder.style.display = opening ? '' : 'none';
  if (!opening || holder.dataset.loaded === '1') return;
  holder.dataset.loaded = '1';
  await loadInicioCommentsList(newsId);
}
window.toggleInicioComments = toggleInicioComments;

async function loadInicioCommentsList(newsId) {
  const holder = document.getElementById('inicio-comments-' + newsId);
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando comentários...</div>';

  const { data, error } = await sbClient
    .from('pokemon_news_comments')
    .select('id,user_id,body,created_at')
    .eq('news_id', newsId)
    .order('created_at', { ascending: true });

  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro ao carregar comentários.</div>'; return; }

  const rows = data || [];
  const myUid = uid();
  const listHtml = rows.map(function (c) {
    const dt = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '';
    const mine = myUid && c.user_id === myUid;
    return (
      '<div class="inicio-comment-item">' +
        '<div class="inicio-comment-hdr">' +
          '<span class="inicio-comment-date">' + dt + '</span>' +
          (mine ? '<button class="update-item-del" title="Apagar" onclick="deleteInicioComment(\'' + c.id + '\',\'' + newsId + '\')">✕</button>' : '') +
        '</div>' +
        '<div class="inicio-comment-text">' + c.body + '</div>' +
      '</div>'
    );
  }).join('');

  holder.innerHTML =
    '<div class="inicio-comment-list">' + (listHtml || '<div class="admin-stats-loading">Seja o primeiro a comentar.</div>') + '</div>' +
    '<div class="inicio-comment-form">' +
      '<input id="inicio-comment-input-' + newsId + '" placeholder="Escreva um comentário..." maxlength="500">' +
      '<button class="btn-mini" onclick="postInicioComment(\'' + newsId + '\')">Comentar</button>' +
    '</div>';
}

async function postInicioComment(newsId) {
  if (!uid()) { alert('Faça login pra comentar.'); return; }
  const input = document.getElementById('inicio-comment-input-' + newsId);
  if (!input) return;
  const body = input.value.trim();
  if (!body) return;

  const { error } = await sbClient.from('pokemon_news_comments').insert({ news_id: newsId, user_id: uid(), body: body });
  if (error) { alert('Erro ao comentar: ' + error.message); return; }
  input.value = '';
  const holder = document.getElementById('inicio-comments-' + newsId);
  if (holder) holder.dataset.loaded = '0';
  await loadInicioCommentsList(newsId);
  loadInicioNews(); // atualiza o contador de comentários no card
}
window.postInicioComment = postInicioComment;

async function deleteInicioComment(commentId, newsId) {
  if (!confirm('Apagar esse comentário?')) return;
  const { error } = await sbClient.from('pokemon_news_comments').delete().eq('id', commentId);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  const holder = document.getElementById('inicio-comments-' + newsId);
  if (holder) holder.dataset.loaded = '0';
  await loadInicioCommentsList(newsId);
  loadInicioNews();
}
window.deleteInicioComment = deleteInicioComment;

// ── VÍDEOS DA COMUNIDADE ────────────────────────────────────────────
async function loadInicioVideos() {
  const holder = document.getElementById('inicio-videos-wrap');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient
    .from('community_videos')
    .select('id,platform,video_url,title,handle')
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro ao carregar vídeos.</div>'; return; }

  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhum vídeo linkado ainda.</div>'; return; }

  holder.innerHTML = '<div class="inicio-video-grid">' + rows.map(function (v) {
    const plat = v.platform === 'tiktok' ? 'TikTok' : 'YouTube';
    return (
      '<a class="inicio-video-card" href="' + v.video_url + '" target="_blank" rel="noopener">' +
        '<div class="inicio-video-plat">' + plat + '</div>' +
        '<div class="inicio-video-title">' + v.title + '</div>' +
        (v.handle ? '<div class="inicio-video-handle">' + v.handle + '</div>' : '') +
      '</a>'
    );
  }).join('') + '</div>';
}

// ── LINKS ÚTEIS ──────────────────────────────────────────────────────
async function loadInicioLinks() {
  const holder = document.getElementById('inicio-links-wrap');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient
    .from('community_links')
    .select('id,title,url,category,icon')
    .order('created_at', { ascending: false });

  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro ao carregar links.</div>'; return; }

  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhum link ainda.</div>'; return; }

  const groups = {};
  rows.forEach(function (l) {
    const cat = l.category || 'Outros';
    (groups[cat] = groups[cat] || []).push(l);
  });

  holder.innerHTML = Object.keys(groups).map(function (cat) {
    const chips = groups[cat].map(function (l) {
      return (
        '<a class="inicio-chip" href="' + l.url + '" target="_blank" rel="noopener">' +
          '<span class="inicio-chip-ic">' + (l.icon || '🔗') + '</span> <b>' + l.title + '</b>' +
        '</a>'
      );
    }).join('');
    return '<div class="inicio-link-group"><div class="inicio-link-group-label">' + cat + '</div><div class="inicio-chips">' + chips + '</div></div>';
  }).join('');
}

// ── REVISTA MYDECK ───────────────────────────────────────────────────
async function loadInicioRevista() {
  const holder = document.getElementById('inicio-revista-wrap');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient
    .from('magazine_articles')
    .select('id,title,subtitle,tag,is_featured,published_at')
    .order('published_at', { ascending: false })
    .limit(10);

  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro ao carregar a revista.</div>'; return; }

  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhum artigo publicado ainda.</div>'; return; }

  holder.innerHTML = rows.map(function (a) {
    const dt = a.published_at ? new Date(a.published_at).toLocaleDateString('pt-BR') : '';
    return (
      '<div class="inicio-article-row' + (a.is_featured ? ' inicio-article-featured' : '') + '">' +
        '<div class="inicio-article-tag">' + (a.tag || 'Revista') + (a.is_featured ? ' · Capa' : '') + '</div>' +
        '<div class="inicio-article-title">' + a.title + '</div>' +
        (a.subtitle ? '<div class="inicio-article-sub">' + a.subtitle + '</div>' : '') +
        '<div class="inicio-article-date">' + dt + '</div>' +
      '</div>'
    );
  }).join('');
}

// ── HOOKS ────────────────────────────────────────────────────────────
(function hookInicioIntoApp() {
  function tryHook() {
    if (typeof window._updateUserChip !== 'function') { setTimeout(tryHook, 50); return; }
    const original = window._updateUserChip;
    window._updateUserChip = function (user) {
      original(user);
      if (user) renderInicio(); else {
        ['inicio-hero-wrap', 'inicio-updates-wrap', 'inicio-news-wrap', 'inicio-videos-wrap', 'inicio-links-wrap', 'inicio-revista-wrap']
          .forEach(function (id) { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
      }
    };
  }
  tryHook();
})();
