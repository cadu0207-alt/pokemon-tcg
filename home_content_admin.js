// ================================================================
// MyDeck — Admin · Conteúdo da aba Início (home_content_admin.js)
// Criado 23/08/2026: painel dentro da aba Admin pra publicar Notícias,
// Vídeos da Comunidade, Links Úteis e artigos da Revista MyDeck — só
// pra quem tem hasPerm('inicio') (staff_access.js — hoje: Eduardo,
// e quem for marcado com essa área depois que o SQL rodar).
//
// Depende de sbClient/currentUser (app.js) e hasPerm() (staff_access.js)
// — carrega depois dos dois. Back-end: home_content_setup.sql.
// ================================================================

function renderHomeContentAdmin() {
  const holder = document.getElementById('home-content-admin-wrap');
  if (!holder) return;
  if (typeof hasPerm !== 'function' || !hasPerm('inicio')) { holder.innerHTML = ''; return; }

  holder.innerHTML =
    '<div class="hc-block">' +
      '<div class="hc-block-title">Notícia do mundo Pokémon</div>' +
      '<div class="hc-block-hint">Registro simples — sem título obrigatório. Imagem ou vídeo são opcionais.</div>' +
      '<textarea id="hc-news-body" placeholder="Texto da notícia..." maxlength="1000"></textarea>' +
      '<div class="hc-row">' +
        '<select id="hc-news-media-type" onchange="hcToggleNewsMediaInput()">' +
          '<option value="none">Sem mídia</option>' +
          '<option value="image">Imagem (URL)</option>' +
          '<option value="video">Vídeo (URL)</option>' +
        '</select>' +
        '<input id="hc-news-media-url" placeholder="URL da imagem/vídeo" style="display:none">' +
        '<button class="btn-mini" onclick="hcPublishNews()">📨 Publicar notícia</button>' +
      '</div>' +
      '<div id="hc-news-list" class="hc-list"></div>' +
    '</div>' +

    '<div class="hc-block">' +
      '<div class="hc-block-title">Vídeo da comunidade</div>' +
      '<div class="hc-row">' +
        '<select id="hc-video-platform"><option value="tiktok">TikTok</option><option value="youtube">YouTube</option></select>' +
        '<input id="hc-video-url" placeholder="URL do vídeo">' +
      '</div>' +
      '<div class="hc-row">' +
        '<input id="hc-video-title" placeholder="Título/legenda" maxlength="120">' +
        '<input id="hc-video-handle" placeholder="@handle ou canal (opcional)" maxlength="60">' +
        '<button class="btn-mini" onclick="hcPublishVideo()">📨 Adicionar vídeo</button>' +
      '</div>' +
      '<div id="hc-video-list" class="hc-list"></div>' +
    '</div>' +

    '<div class="hc-block">' +
      '<div class="hc-block-title">Link útil</div>' +
      '<div class="hc-row">' +
        '<input id="hc-link-icon" placeholder="Emoji" style="max-width:70px" maxlength="4">' +
        '<input id="hc-link-title" placeholder="Título" maxlength="80">' +
        '<input id="hc-link-url" placeholder="URL">' +
        '<input id="hc-link-category" placeholder="Categoria (ex: Comunidade)" maxlength="40">' +
        '<button class="btn-mini" onclick="hcPublishLink()">📨 Adicionar link</button>' +
      '</div>' +
      '<div id="hc-link-list" class="hc-list"></div>' +
    '</div>' +

    '<div class="hc-block">' +
      '<div class="hc-block-title">Artigo da Revista MyDeck</div>' +
      '<div class="hc-row">' +
        '<input id="hc-art-title" placeholder="Título" maxlength="140">' +
        '<input id="hc-art-tag" placeholder="Tag (ex: Mercado, Estratégia)" maxlength="40">' +
      '</div>' +
      '<input id="hc-art-subtitle" placeholder="Subtítulo (opcional)" maxlength="200">' +
      '<textarea id="hc-art-body" placeholder="Texto do artigo..." maxlength="8000"></textarea>' +
      '<div class="hc-row">' +
        '<label class="staff-perm-check"><input type="checkbox" id="hc-art-featured"> Marcar como capa da edição</label>' +
        '<button class="btn-mini" onclick="hcPublishArticle()">📨 Publicar artigo</button>' +
      '</div>' +
      '<div id="hc-article-list" class="hc-list"></div>' +
    '</div>';

  hcLoadNewsList();
  hcLoadVideoList();
  hcLoadLinkList();
  hcLoadArticleList();
}

function hcToggleNewsMediaInput() {
  const sel = document.getElementById('hc-news-media-type');
  const input = document.getElementById('hc-news-media-url');
  if (!sel || !input) return;
  input.style.display = sel.value === 'none' ? 'none' : '';
}
window.hcToggleNewsMediaInput = hcToggleNewsMediaInput;

// ── NOTÍCIAS ─────────────────────────────────────────────────────────
async function hcPublishNews() {
  if (!hasPerm('inicio')) return;
  const bodyEl = document.getElementById('hc-news-body');
  const typeEl = document.getElementById('hc-news-media-type');
  const urlEl = document.getElementById('hc-news-media-url');
  const body = bodyEl.value.trim();
  if (!body) { alert('Escreva o texto da notícia.'); return; }

  const mediaType = typeEl.value;
  const mediaUrl = mediaType === 'none' ? null : urlEl.value.trim() || null;

  const { error } = await sbClient.from('pokemon_news').insert({
    body: body, media_type: mediaType, media_url: mediaUrl, author_uid: uid()
  });
  if (error) { alert('Erro ao publicar: ' + error.message); return; }

  bodyEl.value = ''; urlEl.value = ''; typeEl.value = 'none'; hcToggleNewsMediaInput();
  hcLoadNewsList();
}
window.hcPublishNews = hcPublishNews;

async function hcLoadNewsList() {
  const holder = document.getElementById('hc-news-list');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient
    .from('pokemon_news')
    .select('id,body,media_type,published_at')
    .order('published_at', { ascending: false })
    .limit(30);

  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro: ' + error.message + '</div>'; return; }
  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhuma notícia publicada.</div>'; return; }

  let views = {};
  try {
    const { data: vdata } = await sbClient.rpc('fn_news_view_counts');
    (vdata || []).forEach(function (v) { views[v.news_id] = v.views; });
  } catch (e) {}

  let comments = {};
  try {
    const ids = rows.map(function (r) { return r.id; });
    const { data: cdata } = await sbClient.from('pokemon_news_comments').select('news_id').in('news_id', ids);
    (cdata || []).forEach(function (c) { comments[c.news_id] = (comments[c.news_id] || 0) + 1; });
  } catch (e) {}

  holder.innerHTML = rows.map(function (n) {
    const dt = n.published_at ? new Date(n.published_at).toLocaleDateString('pt-BR') : '';
    const snippet = (n.body || '').slice(0, 90) + ((n.body || '').length > 90 ? '...' : '');
    return (
      '<div class="hc-list-item">' +
        '<div class="hc-list-main">' +
          '<div class="hc-list-snippet">' + snippet + '</div>' +
          '<div class="hc-list-meta">' + dt + ' · 👁 ' + (views[n.id] || 0) + ' visualizações · 💬 ' + (comments[n.id] || 0) + ' comentários</div>' +
        '</div>' +
        '<button class="update-item-del" title="Apagar" onclick="hcDeleteNews(\'' + n.id + '\')">✕</button>' +
      '</div>'
    );
  }).join('');
}

async function hcDeleteNews(id) {
  if (!confirm('Apagar essa notícia? Os comentários dela também somem.')) return;
  const { error } = await sbClient.from('pokemon_news').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  hcLoadNewsList();
}
window.hcDeleteNews = hcDeleteNews;

// ── VÍDEOS ───────────────────────────────────────────────────────────
async function hcPublishVideo() {
  if (!hasPerm('inicio')) return;
  const platform = document.getElementById('hc-video-platform').value;
  const urlEl = document.getElementById('hc-video-url');
  const titleEl = document.getElementById('hc-video-title');
  const handleEl = document.getElementById('hc-video-handle');
  const video_url = urlEl.value.trim();
  const title = titleEl.value.trim();
  if (!video_url || !title) { alert('Preencha a URL e o título do vídeo.'); return; }

  const { error } = await sbClient.from('community_videos').insert({
    platform: platform, video_url: video_url, title: title,
    handle: handleEl.value.trim() || null, added_by: uid()
  });
  if (error) { alert('Erro: ' + error.message); return; }

  urlEl.value = ''; titleEl.value = ''; handleEl.value = '';
  hcLoadVideoList();
}
window.hcPublishVideo = hcPublishVideo;

async function hcLoadVideoList() {
  const holder = document.getElementById('hc-video-list');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient.from('community_videos').select('id,platform,title,handle').order('created_at', { ascending: false }).limit(30);
  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro: ' + error.message + '</div>'; return; }
  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhum vídeo linkado.</div>'; return; }

  holder.innerHTML = rows.map(function (v) {
    return (
      '<div class="hc-list-item">' +
        '<div class="hc-list-main"><div class="hc-list-snippet">' + (v.platform === 'tiktok' ? 'TikTok' : 'YouTube') + ' — ' + v.title + '</div>' +
        '<div class="hc-list-meta">' + (v.handle || '') + '</div></div>' +
        '<button class="update-item-del" title="Apagar" onclick="hcDeleteVideo(\'' + v.id + '\')">✕</button>' +
      '</div>'
    );
  }).join('');
}

async function hcDeleteVideo(id) {
  if (!confirm('Remover esse vídeo?')) return;
  const { error } = await sbClient.from('community_videos').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  hcLoadVideoList();
}
window.hcDeleteVideo = hcDeleteVideo;

// ── LINKS ────────────────────────────────────────────────────────────
async function hcPublishLink() {
  if (!hasPerm('inicio')) return;
  const iconEl = document.getElementById('hc-link-icon');
  const titleEl = document.getElementById('hc-link-title');
  const urlEl = document.getElementById('hc-link-url');
  const catEl = document.getElementById('hc-link-category');
  const title = titleEl.value.trim();
  const url = urlEl.value.trim();
  if (!title || !url) { alert('Preencha título e URL do link.'); return; }

  const { error } = await sbClient.from('community_links').insert({
    title: title, url: url, category: catEl.value.trim() || null,
    icon: iconEl.value.trim() || null, added_by: uid()
  });
  if (error) { alert('Erro: ' + error.message); return; }

  iconEl.value = ''; titleEl.value = ''; urlEl.value = ''; catEl.value = '';
  hcLoadLinkList();
}
window.hcPublishLink = hcPublishLink;

async function hcLoadLinkList() {
  const holder = document.getElementById('hc-link-list');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient.from('community_links').select('id,title,category,icon').order('created_at', { ascending: false }).limit(50);
  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro: ' + error.message + '</div>'; return; }
  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhum link ainda.</div>'; return; }

  holder.innerHTML = rows.map(function (l) {
    return (
      '<div class="hc-list-item">' +
        '<div class="hc-list-main"><div class="hc-list-snippet">' + (l.icon || '🔗') + ' ' + l.title + '</div>' +
        '<div class="hc-list-meta">' + (l.category || '') + '</div></div>' +
        '<button class="update-item-del" title="Apagar" onclick="hcDeleteLink(\'' + l.id + '\')">✕</button>' +
      '</div>'
    );
  }).join('');
}

async function hcDeleteLink(id) {
  if (!confirm('Remover esse link?')) return;
  const { error } = await sbClient.from('community_links').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  hcLoadLinkList();
}
window.hcDeleteLink = hcDeleteLink;

// ── REVISTA ──────────────────────────────────────────────────────────
async function hcPublishArticle() {
  if (!hasPerm('inicio')) return;
  const titleEl = document.getElementById('hc-art-title');
  const tagEl = document.getElementById('hc-art-tag');
  const subEl = document.getElementById('hc-art-subtitle');
  const bodyEl = document.getElementById('hc-art-body');
  const featEl = document.getElementById('hc-art-featured');

  const title = titleEl.value.trim();
  const body = bodyEl.value.trim();
  if (!title || !body) { alert('Preencha título e texto do artigo.'); return; }

  // Só um artigo é capa por vez — desmarca o anterior antes de marcar o novo.
  if (featEl.checked) {
    await sbClient.from('magazine_articles').update({ is_featured: false }).eq('is_featured', true);
  }

  const { error } = await sbClient.from('magazine_articles').insert({
    title: title, subtitle: subEl.value.trim() || null, tag: tagEl.value.trim() || null,
    body: body, is_featured: !!featEl.checked, author_uid: uid()
  });
  if (error) { alert('Erro: ' + error.message); return; }

  titleEl.value = ''; tagEl.value = ''; subEl.value = ''; bodyEl.value = ''; featEl.checked = false;
  hcLoadArticleList();
}
window.hcPublishArticle = hcPublishArticle;

async function hcLoadArticleList() {
  const holder = document.getElementById('hc-article-list');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const { data, error } = await sbClient.from('magazine_articles').select('id,title,tag,is_featured,published_at').order('published_at', { ascending: false }).limit(30);
  if (error) { holder.innerHTML = '<div class="admin-stats-loading">Erro: ' + error.message + '</div>'; return; }
  const rows = data || [];
  if (!rows.length) { holder.innerHTML = '<div class="admin-stats-loading">Nenhum artigo publicado.</div>'; return; }

  holder.innerHTML = rows.map(function (a) {
    const dt = a.published_at ? new Date(a.published_at).toLocaleDateString('pt-BR') : '';
    return (
      '<div class="hc-list-item">' +
        '<div class="hc-list-main"><div class="hc-list-snippet">' + (a.is_featured ? '⭐ ' : '') + a.title + '</div>' +
        '<div class="hc-list-meta">' + (a.tag || '') + ' · ' + dt + '</div></div>' +
        '<button class="update-item-del" title="Apagar" onclick="hcDeleteArticle(\'' + a.id + '\')">✕</button>' +
      '</div>'
    );
  }).join('');
}

async function hcDeleteArticle(id) {
  if (!confirm('Apagar esse artigo?')) return;
  const { error } = await sbClient.from('magazine_articles').delete().eq('id', id);
  if (error) { alert('Erro: ' + error.message); return; }
  hcLoadArticleList();
}
window.hcDeleteArticle = hcDeleteArticle;
