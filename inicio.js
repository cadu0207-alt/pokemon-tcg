// ================================================================
// MyDeck — Aba "🏠 Início" (inicio.js)
// Criado 23/08/2026 a pedido do Eduardo: primeira aba do menu, com
// Novidades do MyDeck (reaproveita site_updates), Notícias do Mundo
// Pokémon (agora com título/subtítulo/texto — matéria de verdade, não
// mais um textarea solto), Vídeos da Comunidade (TikTok/YouTube
// reproduzidos direto no site, não só linkados), Links Úteis e a
// Revista MyDeck (artigos de verdade).
//
// REVISADO 24/08/2026 (pedido do Eduardo):
// - Corrigido XSS armazenado: todo texto vindo do banco (notícia,
//   comentário, artigo, vídeo, link) passa por inicioEsc()/inicioEscML()
//   antes de entrar no innerHTML. Antes ia direto — qualquer usuário
//   logado podia postar um comentário com HTML/JS e ele executava na
//   tela de quem visse a aba Início.
// - Vídeos (YouTube/TikTok) agora tocam embutidos no site (iframe/embed
//   oficial) em vez de só abrir link em nova aba.
// - Notícia virou "matéria": título + subtítulo (opcionais, mas usados
//   no formulário) + texto, com uma tela de leitura (modal) própria —
//   os comentários vivem lá, não mais espremidos dentro do card do feed.
// - Notícias/Vídeos/Links/Revista deixaram de ser 4 seções separadas e
//   viraram um feed único (loadInicioFeed), ordenado por data (mais novo
//   primeiro) com scroll infinito — ver INICIO_FEED_ITEMS/inicioRenderFeedPage.
//   Vídeo ganhou mais espaço no feed (coluna única, não mais grid).
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
// magazine_articles + RPCs fn_register_news_view/fn_news_view_counts)
// + home_content_news_title_24ago2026.sql (colunas title/subtitle
// novas em pokemon_news — rodar depois do setup original).
// ================================================================

const INICIO_MEDIA_LABEL = { image: '🖼 imagem', video: '🎥 vídeo', none: '' };

// ── SEGURANÇA — escape de HTML (corrige XSS 24/08/2026) ────────────
// Qualquer texto que veio do banco (usuário comum inclui: comentário;
// admin inclui: notícia/vídeo/link/artigo) passa por aqui antes de virar
// innerHTML. Sem isso, um comentário tipo "<img src=x onerror=...>"
// executava no navegador de quem visse a aba.
function inicioEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Igual, mas preserva quebra de linha (pra texto de matéria/artigo/comentário
// digitado em textarea, onde \n importa pra leitura).
function inicioEscML(s) {
  return inicioEsc(s).replace(/\n/g, '<br>');
}
// URL só entra em href/src se for http(s) — evita "javascript:" etc.
function inicioSafeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  return /^https?:\/\//i.test(s) ? s : '#';
}
// Corta no espaço mais próximo (não no meio da palavra) — corrigido 24/08/2026,
// o Eduardo reparou "prepa…"/"Reinad…" feio nos cards de notícia antiga (sem
// título — cai no fallback que usa o começo do corpo).
function inicioTruncate(s, max) {
  const str = String(s == null ? '' : s);
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
}

// ── VÍDEO EMBUTIDO — extrai ID do YouTube/TikTok pra tocar no site ──
function inicioYoutubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function inicioTiktokId(url) {
  if (!url) return null;
  const m = String(url).match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}
// Monta o embed real (iframe do YouTube / embed oficial do TikTok). Se não
// reconhecer a URL, cai num link "▶ Assistir" pra fora — nunca quebra.
function inicioVideoEmbedHtml(platform, url, title) {
  const safeUrl = inicioSafeUrl(url);
  if (platform === 'youtube') {
    const yid = inicioYoutubeId(url);
    if (yid) {
      return '<div class="inicio-video-embed"><iframe src="https://www.youtube-nocookie.com/embed/' + yid + '" title="' + inicioEsc(title || 'Vídeo') + '" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
    }
  } else if (platform === 'tiktok') {
    const tid = inicioTiktokId(url);
    if (tid) {
      return '<blockquote class="tiktok-embed" cite="' + safeUrl + '" data-video-id="' + tid + '" style="max-width:325px;min-width:245px;margin:0 auto"><section></section></blockquote>';
    }
  }
  const label = platform === 'tiktok' ? 'TikTok' : platform === 'youtube' ? 'YouTube' : 'vídeo';
  return '<a class="inicio-video-fallback" href="' + safeUrl + '" target="_blank" rel="noopener">▶ Assistir no ' + label + '</a>';
}
// O embed.js do TikTok processa <blockquote class="tiktok-embed"> presentes
// no DOM no momento em que ele carrega/roda. Como os cards são inseridos
// via innerHTML depois (SPA), precisa recarregar o script toda vez que
// aparece um TikTok novo na tela — troca a tag antiga por uma nova.
function inicioReloadTiktokEmbed() {
  const old = document.getElementById('inicio-tiktok-embed-script');
  if (old) old.remove();
  const s = document.createElement('script');
  s.id = 'inicio-tiktok-embed-script';
  s.async = true;
  s.src = 'https://www.tiktok.com/embed.js';
  document.body.appendChild(s);
}

async function renderInicio() {
  if (!sbClient || !currentUser) return;
  renderInicioHero();
  loadInicioUpdates();
  loadInicioFeed();
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
      '<div class="inicio-hero-eyebrow">' + inicioEsc(a.tag || 'Destaque') + ' · Revista MyDeck</div>' +
      '<h2 class="inicio-hero-title">' + inicioEsc(a.title) + '</h2>' +
      (a.subtitle ? '<div class="inicio-hero-sub">' + inicioEsc(a.subtitle) + '</div>' : '') +
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
        '<div class="inicio-update-title">🆕 ' + inicioEsc(u.title) + '</div>' +
        '<div class="inicio-update-date">' + dt + '</div>' +
      '</div>'
    );
  }).join('') + '</div>';
}

// ── FEED ÚNICO — 24/08/2026 (pedido do Eduardo) ─────────────────────
// Antes eram 4 seções separadas (Notícias / Vídeos / Links / Revista),
// cada uma com sua própria lista. Agora tudo entra num feed só, ordenado
// por data (mais novo primeiro), com scroll infinito — o usuário rola pra
// ver o que é mais antigo em vez de navegar seção por seção. Cada tipo de
// item mantém sua cara própria (a notícia abre matéria+comentários, o
// vídeo toca embutido — um pouco maior que antes — link e artigo da
// revista ficam mais compactos), só a ordem que virou uma linha do tempo
// única.
let INICIO_NEWS_CACHE = {}; // id -> row da notícia, pra abrir o modal sem re-buscar
let INICIO_FEED_ITEMS = []; // merge de notícia/vídeo/link/artigo, já ordenado por data desc
let INICIO_FEED_RENDERED = 0;
let INICIO_FEED_COMMENT_COUNTS = {};
const INICIO_FEED_PAGE = 12;
let inicioFeedObserver = null;

async function loadInicioFeed() {
  const holder = document.getElementById('inicio-feed-wrap');
  if (!holder) return;
  holder.innerHTML = '<div class="admin-stats-loading">Carregando...</div>';

  const [newsRes, videoRes, linkRes, artRes] = await Promise.all([
    sbClient.from('pokemon_news').select('id,title,subtitle,body,media_type,media_url,author_uid,published_at').order('published_at', { ascending: false }).limit(40),
    sbClient.from('community_videos').select('id,platform,video_url,title,handle,created_at').order('created_at', { ascending: false }).limit(40),
    sbClient.from('community_links').select('id,title,url,category,icon,created_at').order('created_at', { ascending: false }).limit(40),
    sbClient.from('magazine_articles').select('id,title,subtitle,tag,is_featured,published_at').order('published_at', { ascending: false }).limit(40)
  ]);

  const items = [];
  (newsRes.data || []).forEach(function (n) { items.push({ kind: 'news', date: n.published_at, row: n }); });
  (videoRes.data || []).forEach(function (v) { items.push({ kind: 'video', date: v.created_at, row: v }); });
  (linkRes.data || []).forEach(function (l) { items.push({ kind: 'link', date: l.created_at, row: l }); });
  (artRes.data || []).forEach(function (a) { items.push({ kind: 'article', date: a.published_at, row: a }); });
  items.sort(function (a, b) { return new Date(b.date || 0) - new Date(a.date || 0); });

  INICIO_FEED_ITEMS = items;
  INICIO_FEED_RENDERED = 0;
  INICIO_NEWS_CACHE = {};
  items.forEach(function (it) { if (it.kind === 'news') INICIO_NEWS_CACHE[it.row.id] = it.row; });

  if (!items.length) { holder.innerHTML = '<div class="admin-stats-loading">Nada publicado ainda.</div>'; return; }

  const newsIds = items.filter(function (it) { return it.kind === 'news'; }).map(function (it) { return it.row.id; });
  INICIO_FEED_COMMENT_COUNTS = {};
  if (newsIds.length) {
    try {
      const { data: cdata } = await sbClient.from('pokemon_news_comments').select('news_id').in('news_id', newsIds);
      (cdata || []).forEach(function (c) { INICIO_FEED_COMMENT_COUNTS[c.news_id] = (INICIO_FEED_COMMENT_COUNTS[c.news_id] || 0) + 1; });
    } catch (e) { /* silencioso — comentário é só decoração aqui */ }
  }

  holder.innerHTML = '<div class="inicio-feed"></div>';
  inicioRenderFeedPage();
  inicioSetupFeedObserver();
}

// Renderiza a próxima leva do feed já carregado em memória (INICIO_FEED_ITEMS)
// — scroll infinito sem re-buscar do banco a cada rolagem.
function inicioRenderFeedPage() {
  const list = document.querySelector('#inicio-feed-wrap .inicio-feed');
  if (!list) return;
  const slice = INICIO_FEED_ITEMS.slice(INICIO_FEED_RENDERED, INICIO_FEED_RENDERED + INICIO_FEED_PAGE);
  if (!slice.length) return;

  let hasTiktok = false;
  const html = slice.map(function (it) {
    if (it.kind === 'video' && it.row.platform === 'tiktok') hasTiktok = true;
    return inicioRenderFeedItem(it);
  }).join('');
  list.insertAdjacentHTML('beforeend', html);
  if (hasTiktok) inicioReloadTiktokEmbed();

  // Registra visualização (1x por usuário) só das notícias que acabaram de
  // entrar na tela — silencioso, admin lê a soma via fn_news_view_counts.
  slice.filter(function (it) { return it.kind === 'news'; }).forEach(function (it) {
    sbClient.rpc('fn_register_news_view', { p_news_id: it.row.id }).then(function () {}, function () {});
  });

  INICIO_FEED_RENDERED += slice.length;
  const sentinel = document.getElementById('inicio-feed-sentinel');
  if (sentinel) sentinel.style.display = INICIO_FEED_RENDERED >= INICIO_FEED_ITEMS.length ? 'none' : '';
}

function inicioSetupFeedObserver() {
  const sentinel = document.getElementById('inicio-feed-sentinel');
  if (!sentinel || typeof IntersectionObserver === 'undefined') return;
  if (inicioFeedObserver) inicioFeedObserver.disconnect();
  sentinel.style.display = INICIO_FEED_RENDERED >= INICIO_FEED_ITEMS.length ? 'none' : '';
  inicioFeedObserver = new IntersectionObserver(function (entries) {
    if (entries.some(function (e) { return e.isIntersecting; })) inicioRenderFeedPage();
  }, { rootMargin: '400px' });
  inicioFeedObserver.observe(sentinel);
}

function inicioRenderFeedItem(it) {
  if (it.kind === 'news') return inicioFeedNewsCard(it.row);
  if (it.kind === 'video') return inicioFeedVideoCard(it.row);
  if (it.kind === 'link') return inicioFeedLinkCard(it.row);
  if (it.kind === 'article') return inicioFeedArticleCard(it.row);
  return '';
}

function inicioFeedNewsCard(n) {
  const dt = n.published_at ? new Date(n.published_at).toLocaleDateString('pt-BR') : '';
  const mediaTag = INICIO_MEDIA_LABEL[n.media_type] || '';
  const thumbBlock = n.media_type === 'image' && n.media_url
    ? '<img class="inicio-news-media" src="' + inicioSafeUrl(n.media_url) + '" alt="" loading="lazy">'
    : '';
  const commentN = INICIO_FEED_COMMENT_COUNTS[n.id] || 0;
  const title = n.title ? inicioEsc(n.title) : inicioEsc(inicioTruncate(n.body, 70));
  return (
    '<div class="inicio-news-card" data-news-id="' + n.id + '" onclick="openInicioArticle(\'' + n.id + '\')" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\')openInicioArticle(\'' + n.id + '\')">' +
      (mediaTag ? '<div class="inicio-news-tag">' + mediaTag + '</div>' : '') +
      thumbBlock +
      '<div class="inicio-news-title">' + title + '</div>' +
      (n.subtitle ? '<div class="inicio-news-sub">' + inicioEsc(n.subtitle) + '</div>' : '') +
      (n.title ? '<div class="inicio-news-snippet">' + inicioEsc(inicioTruncate(n.body, 110)) + '</div>' : '') +
      '<div class="inicio-news-foot">' +
        '<span class="inicio-news-date">' + dt + '</span>' +
        '<span class="inicio-news-comment-toggle">💬 ' + commentN + ' comentário' + (commentN === 1 ? '' : 's') + '</span>' +
      '</div>' +
    '</div>'
  );
}

// Vídeo no feed único ganhou mais espaço que no grid antigo (pedido do
// Eduardo — "o vídeo pode aumentar um pouco o tamanho"): o feed é uma
// coluna só (não mais grid de várias colunas), então o embed 16:9 usa a
// largura inteira da coluna (até 720px, ver .inicio-feed no style.css).
function inicioFeedVideoCard(v) {
  const dt = v.created_at ? new Date(v.created_at).toLocaleDateString('pt-BR') : '';
  const plat = v.platform === 'tiktok' ? 'TikTok' : 'YouTube';
  return (
    '<div class="inicio-video-card inicio-feed-video-card">' +
      '<div class="inicio-video-plat">' + plat + '</div>' +
      inicioVideoEmbedHtml(v.platform, v.video_url, v.title) +
      '<div class="inicio-video-title">' + inicioEsc(v.title) + '</div>' +
      '<div class="inicio-feed-item-foot">' +
        (v.handle ? '<span class="inicio-video-handle">' + inicioEsc(v.handle) + '</span>' : '<span></span>') +
        '<span class="inicio-news-date">' + dt + '</span>' +
      '</div>' +
    '</div>'
  );
}

function inicioFeedLinkCard(l) {
  const dt = l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '';
  return (
    '<a class="inicio-feed-link-card" href="' + inicioSafeUrl(l.url) + '" target="_blank" rel="noopener">' +
      '<span class="inicio-chip-ic">' + inicioEsc(l.icon || '🔗') + '</span>' +
      '<span class="inicio-feed-link-main">' +
        '<span class="inicio-feed-link-title">' + inicioEsc(l.title) + '</span>' +
        (l.category ? '<span class="inicio-feed-link-cat">' + inicioEsc(l.category) + '</span>' : '') +
      '</span>' +
      '<span class="inicio-news-date">' + dt + '</span>' +
    '</a>'
  );
}

function inicioFeedArticleCard(a) {
  const dt = a.published_at ? new Date(a.published_at).toLocaleDateString('pt-BR') : '';
  return (
    '<div class="inicio-article-row inicio-feed-article-card' + (a.is_featured ? ' inicio-article-featured' : '') + '">' +
      '<div class="inicio-article-tag">📖 ' + inicioEsc(a.tag || 'Revista') + (a.is_featured ? ' · Capa' : '') + '</div>' +
      '<div class="inicio-article-title">' + inicioEsc(a.title) + '</div>' +
      (a.subtitle ? '<div class="inicio-article-sub">' + inicioEsc(a.subtitle) + '</div>' : '') +
      '<div class="inicio-article-date">' + dt + '</div>' +
    '</div>'
  );
}

// Atualiza só o contador de comentários do card já renderizado no feed —
// evita re-buscar/re-renderizar o feed inteiro (perderia a posição do
// scroll) só porque um comentário foi postado/apagado.
async function inicioRefreshNewsCommentCount(newsId) {
  let n = 0;
  try {
    const { count } = await sbClient.from('pokemon_news_comments').select('id', { count: 'exact', head: true }).eq('news_id', newsId);
    n = count || 0;
  } catch (e) { return; }
  INICIO_FEED_COMMENT_COUNTS[newsId] = n;
  const el = document.querySelector('.inicio-news-card[data-news-id="' + newsId + '"] .inicio-news-comment-toggle');
  if (el) el.textContent = '💬 ' + n + ' comentário' + (n === 1 ? '' : 's');
}

// ── MODAL DE MATÉRIA — leitura completa + comentários ───────────────
// Antes os comentários viviam espremidos dentro do card do feed (toggle
// inline). Agora a matéria abre numa tela própria: título, subtítulo,
// texto completo, mídia embutida e os comentários logo abaixo, com mais
// espaço e sem competir com o resto do feed.
async function openInicioArticle(newsId) {
  let n = INICIO_NEWS_CACHE[newsId];
  if (!n) {
    const { data } = await sbClient.from('pokemon_news').select('id,title,subtitle,body,media_type,media_url,author_uid,published_at').eq('id', newsId).limit(1);
    n = data && data[0];
  }
  const modal = document.getElementById('inicio-article-modal');
  if (!modal || !n) return;

  const dt = n.published_at ? new Date(n.published_at).toLocaleDateString('pt-BR') : '';
  const mediaBlock = n.media_type === 'image' && n.media_url
    ? '<img class="inicio-article-media" src="' + inicioSafeUrl(n.media_url) + '" alt="">'
    : n.media_type === 'video' && n.media_url
      ? inicioVideoEmbedHtml(inicioYoutubeId(n.media_url) ? 'youtube' : inicioTiktokId(n.media_url) ? 'tiktok' : 'outro', n.media_url, n.title)
      : '';
  const hasTiktok = n.media_type === 'video' && inicioTiktokId(n.media_url);

  modal.innerHTML =
    '<div class="inicio-modal-backdrop" onclick="closeInicioArticle()"></div>' +
    '<div class="inicio-modal-card" role="dialog" aria-modal="true">' +
      '<button type="button" class="inicio-modal-close" onclick="closeInicioArticle()" title="Fechar" aria-label="Fechar">✕</button>' +
      '<div class="inicio-article-tag-row">📰 Notícia do Mundo Pokémon · ' + dt + '</div>' +
      '<h2 class="inicio-article-full-title">' + inicioEsc(n.title || 'Notícia') + '</h2>' +
      (n.subtitle ? '<div class="inicio-article-full-sub">' + inicioEsc(n.subtitle) + '</div>' : '') +
      (mediaBlock ? '<div class="inicio-article-media-wrap">' + mediaBlock + '</div>' : '') +
      '<div class="inicio-article-full-body">' + inicioEscML(n.body) + '</div>' +
      '<div class="inicio-comments-section">' +
        '<div class="inicio-comments-heading">💬 Comentários</div>' +
        '<div class="inicio-comments" id="inicio-comments-' + n.id + '"></div>' +
      '</div>' +
    '</div>';

  modal.style.display = '';
  document.body.classList.add('inicio-modal-open');
  document.addEventListener('keydown', inicioModalEscHandler);
  if (hasTiktok) inicioReloadTiktokEmbed();

  await loadInicioCommentsList(n.id);
}
window.openInicioArticle = openInicioArticle;

function inicioModalEscHandler(e) { if (e.key === 'Escape') closeInicioArticle(); }

function closeInicioArticle() {
  const modal = document.getElementById('inicio-article-modal');
  if (modal) { modal.style.display = 'none'; modal.innerHTML = ''; }
  document.body.classList.remove('inicio-modal-open');
  document.removeEventListener('keydown', inicioModalEscHandler);
}
window.closeInicioArticle = closeInicioArticle;

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
        '<div class="inicio-comment-text">' + inicioEscML(c.body) + '</div>' +
      '</div>'
    );
  }).join('');

  holder.innerHTML =
    '<div class="inicio-comment-list">' + (listHtml || '<div class="admin-stats-loading">Seja o primeiro a comentar.</div>') + '</div>' +
    '<div class="inicio-comment-form">' +
      '<textarea id="inicio-comment-input-' + newsId + '" placeholder="Escreva um comentário..." maxlength="500"></textarea>' +
      '<button class="btn-mini" onclick="postInicioComment(\'' + newsId + '\')">Comentar</button>' +
    '</div>';
}

async function postInicioComment(newsId) {
  if (!uid()) { alert('Faça login pra comentar.'); return; }
  const input = document.getElementById('inicio-comment-input-' + newsId);
  if (!input) return;
  const body = input.value.trim();
  if (!body) return;
  if (body.length > 500) { alert('Comentário muito longo (máx. 500 caracteres).'); return; }

  const { error } = await sbClient.from('pokemon_news_comments').insert({ news_id: newsId, user_id: uid(), body: body });
  if (error) { alert('Erro ao comentar: ' + error.message); return; }
  input.value = '';
  await loadInicioCommentsList(newsId);
  inicioRefreshNewsCommentCount(newsId); // atualiza só o contador no card do feed, sem re-renderizar tudo
}
window.postInicioComment = postInicioComment;

async function deleteInicioComment(commentId, newsId) {
  if (!confirm('Apagar esse comentário?')) return;
  const { error } = await sbClient.from('pokemon_news_comments').delete().eq('id', commentId);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  await loadInicioCommentsList(newsId);
  inicioRefreshNewsCommentCount(newsId);
}
window.deleteInicioComment = deleteInicioComment;

// ── HOOKS ────────────────────────────────────────────────────────────
(function hookInicioIntoApp() {
  function tryHook() {
    if (typeof window._updateUserChip !== 'function') { setTimeout(tryHook, 50); return; }
    const original = window._updateUserChip;
    window._updateUserChip = function (user) {
      original(user);
      if (user) renderInicio(); else {
        closeInicioArticle();
        if (inicioFeedObserver) { inicioFeedObserver.disconnect(); inicioFeedObserver = null; }
        INICIO_FEED_ITEMS = []; INICIO_FEED_RENDERED = 0;
        ['inicio-hero-wrap', 'inicio-updates-wrap', 'inicio-feed-wrap']
          .forEach(function (id) { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
      }
    };
  }
  tryHook();
})();
